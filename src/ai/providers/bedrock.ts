import { createHash, createHmac } from 'node:crypto';
import type { AIProvider, AIMessage, AICompletionOptions, AIConfig } from '../types.js';

interface BedrockConverseResponse {
  output?: {
    message?: {
      content?: Array<{ text?: string }>;
    };
  };
}

/**
 * Amazon Bedrock provider using SigV4 request signing.
 *
 * Required config:
 * - awsRegion
 * - awsAccessKeyId
 * - awsSecretAccessKey
 * Optional:
 * - awsSessionToken
 */
export class BedrockProvider implements AIProvider {
  name = 'bedrock';
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken?: string;
  private readonly defaultModel: string;

  constructor(config: AIConfig) {
    this.region = config.awsRegion || '';
    this.accessKeyId = config.awsAccessKeyId || '';
    this.secretAccessKey = config.awsSecretAccessKey || '';
    this.sessionToken = config.awsSessionToken;
    this.defaultModel = config.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

    if (!this.region || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('Bedrock provider requires awsRegion, awsAccessKeyId, and awsSecretAccessKey.');
    }
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 2048;
    const temperature = options?.temperature ?? 0.3;
    const host = `bedrock-runtime.${this.region}.amazonaws.com`;
    const uri = `/model/${encodeURIComponent(model)}/converse`;
    const url = `https://${host}${uri}`;

    const system = messages.find((message) => message.role === 'system')?.content;
    const chatMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: [{ text: message.content }],
      }));

    const payloadObject: Record<string, unknown> = {
      messages: chatMessages,
      inferenceConfig: {
        maxTokens,
        temperature,
      },
    };

    if (system) {
      payloadObject.system = [{ text: system }];
    }

    const payload = JSON.stringify(payloadObject);
    const signedHeaders = this.signRequest({
      host,
      method: 'POST',
      uri,
      payload,
      service: 'bedrock',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: signedHeaders,
      body: payload,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bedrock API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as BedrockConverseResponse;
    const text = data.output?.message?.content?.map((entry) => entry.text || '').join('').trim();
    return text || '';
  }

  private signRequest(input: {
    host: string;
    method: string;
    uri: string;
    payload: string;
    service: string;
  }): Record<string, string> {
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256(input.payload);
    const credentialScope = `${dateStamp}/${this.region}/${input.service}/aws4_request`;

    const canonicalHeadersRecord: Record<string, string> = {
      'content-type': 'application/json',
      host: input.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    if (this.sessionToken) {
      canonicalHeadersRecord['x-amz-security-token'] = this.sessionToken;
    }

    const canonicalHeaderKeys = Object.keys(canonicalHeadersRecord).sort();
    const canonicalHeaders = canonicalHeaderKeys
      .map((key) => `${key}:${canonicalHeadersRecord[key]}\n`)
      .join('');
    const signedHeaders = canonicalHeaderKeys.join(';');

    const canonicalRequest = [
      input.method,
      input.uri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(dateStamp, input.service);
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: input.host,
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': payloadHash,
      Authorization: authorization,
    };

    if (this.sessionToken) {
      headers['X-Amz-Security-Token'] = this.sessionToken;
    }

    return headers;
  }

  private getSignatureKey(dateStamp: string, service: string): Buffer {
    const kDate = this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = this.hmac(kDate, this.region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  private hmac(key: string | Buffer, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
  }

  private sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private toAmzDate(date: Date): string {
    const iso = date.toISOString();
    return iso.replace(/[:-]|\.\d{3}/g, '');
  }
}
