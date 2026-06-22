import axios from 'axios';
import { LoginusProfileClient } from './loginus-profile.client';

jest.mock('axios');

const mockedPatch = jest.mocked(axios.patch);

describe('LoginusProfileClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LOGINUS_API_BASE_URL: 'https://id.startapus.com/api/v2',
      LOGINUS_EMBEDDED_SECRET: 'test-secret',
    };
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: { ok: true } } as never);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('PATCHes profile to Loginus embedded API', async () => {
    const client = new LoginusProfileClient();
    await client.syncProfileToLoginus({
      sub: 'sub-1',
      firstName: 'Ivan',
      lastName: 'Petrov',
      avatarUrl: 'https://messenger.example.com/uploads/a.jpg',
    });

    expect(mockedPatch).toHaveBeenCalledWith(
      'https://id.startapus.com/api/v2/embedded-apps/chatus/profile',
      {
        sub: 'sub-1',
        firstName: 'Ivan',
        lastName: 'Petrov',
        avatarUrl: 'https://messenger.example.com/uploads/a.jpg',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Embedded-App-Secret': 'test-secret',
        },
      },
    );
  });

  it('skips duplicate outbound sync for the same payload', async () => {
    const client = new LoginusProfileClient();
    const profile = {
      sub: 'sub-1',
      firstName: 'Ivan',
      lastName: 'Petrov',
    };

    await client.syncProfileToLoginus(profile);
    await client.syncProfileToLoginus(profile);

    expect(mockedPatch).toHaveBeenCalledTimes(1);
  });
});
