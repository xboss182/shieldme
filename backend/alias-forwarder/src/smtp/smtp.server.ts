import 'dotenv/config';
import SMTPServer from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';
import { handleInbound } from '../modules/inbound/inbound.service.js';
import { processSmtpBounce } from '../modules/bounces/bounces.service.js';
import { logger } from '../lib/logger.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';

configureRelayKmsFromEnv();

// smtp-server ships CJS; handle ESM interop
const Server: typeof SMTPServer.SMTPServer =
  (SMTPServer as any).SMTPServer ?? (SMTPServer as any).default?.SMTPServer ?? (SMTPServer as any);

export function createSmtpServer() {
  const server = new Server({
    authOptional: true,
    secure: false,
    disabledCommands: ['AUTH'],

    onData(
      stream: SMTPServerDataStream,
      session: SMTPServerSession,
      callback: (err?: Error | null) => void,
    ) {
      const chunks: Buffer[] = [];
      let sizeBytes = 0;

      stream.on('data', (chunk: Buffer) => {
        sizeBytes += chunk.length;
        if (sizeBytes <= 10 * 1024 * 1024) chunks.push(chunk);
      });

      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);

        let messageId: string | undefined;
        let subject: string | undefined;
        let textBody: string | undefined;
        let htmlBody: string | undefined;
        let headers: Record<string, string> | undefined;
        try {
          const parsed = await simpleParser(raw, { skipHtmlToText: false, skipTextToHtml: false });
          messageId = parsed.messageId ?? undefined;
          subject = parsed.subject ?? undefined;
          textBody = typeof parsed.text === 'string' ? parsed.text : undefined;
          htmlBody = typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml ?? undefined);
          headers = {};
          for (const [key, value] of parsed.headers.entries()) {
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
          }
        } catch {
          // non-fatal — forward with envelope-only metadata
        }

        const rcptTo = session.envelope.rcptTo;
        if (!rcptTo || rcptTo.length === 0) return callback(new Error('No recipients'));

        const errors: string[] = [];
        for (const rcpt of rcptTo) {
          try {
            const at = rcpt.address.indexOf('@');
            const localPart = at === -1 ? '' : rcpt.address.slice(0, at);
            const domain = at === -1 ? '' : rcpt.address.slice(at + 1).toLowerCase();
            const bounceToken = domain.startsWith('sm-bounces.') ? localPart.match(/^b\+([a-f0-9]{48,128})$/i)?.[1] : undefined;
            if (bounceToken) {
              if (!(await processSmtpBounce(bounceToken, {
                rawMessage: raw,
                sizeBytes,
                envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
                remoteAddress: session.remoteAddress,
              }))) throw new Error('Invalid bounce DSN');
              continue;
            }
            await handleInbound({
              from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
              to: rcpt.address,
              messageId,
              sizeBytes,
              subject,
              textBody,
              htmlBody,
              headers,
              rawMessage: raw,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn({ to: rcpt.address, err: msg }, 'Inbound rejected');
            errors.push(msg);
          }
        }

        if (errors.length === rcptTo.length) return callback(new Error(errors[0]));
        callback();
      });

      stream.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'SMTP stream error');
        callback(err);
      });
    },

  });

  return server;
}

// Standalone entry point
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2525);
const server = createSmtpServer();
server.listen(SMTP_PORT, () => {
  logger.info({ port: SMTP_PORT }, 'SMTP ingress server listening');
});
