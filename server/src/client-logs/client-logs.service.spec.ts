import { ClientLogsService } from './client-logs.service';

function sanitize(text: string): string {
  const service = new ClientLogsService() as unknown as {
    sanitize(text: string): string;
  };
  return service.sanitize(text);
}

describe('ClientLogsService sanitizer', () => {
  it('keeps Telegram api ids while scrubbing secrets and OTPs', () => {
    const result = sanitize(
      '{"apiId":12345678,"api_id":1234567,"otp":654321,"api_hash":"deadbeefcafebabe","token":"Bearer abc.def"}',
    );

    expect(result).toContain('"apiId":12345678');
    expect(result).toContain('"api_id":1234567');
    expect(result).toContain('"otp":[code]');
    expect(result).toContain('api_hash=[redacted]');
    expect(result).toContain('Bearer [redacted]');
  });
});
