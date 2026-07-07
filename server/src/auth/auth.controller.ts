import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Res,
  Query,
  Req,
} from '@nestjs/common';
import * as Express from 'express';
import { AuthService } from './auth.service';
import {
  appendOAuthStateCookie,
  CHATUS_WEB_SESSION_KEY,
  clearOAuthStateCookie,
  readRequestCookie,
} from './auth-web.constants';
import { LoginusDto } from './dto/loginus.dto';
import { LoginusExchangeDto } from './dto/loginus-exchange.dto';
import { LoginusSyncProfileDto } from './dto/loginus-sync-profile.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login-url')
  getLoginUrl(
    @Query('redirect_uri') redirectUriParam?: string,
    @Query('platform') platform?: string,
    @Res({ passthrough: true }) res?: Express.Response,
  ) {
    const result = this.authService.getLoginUrl(redirectUriParam, platform);
    if (result.oauth_state && res) {
      appendOAuthStateCookie(res, result.oauth_state);
    }
    console.log('[Auth] GET /login-url →', {
      url: result.url?.slice(0, 80) + '...',
      redirect_uri: result.redirect_uri,
      platform: platform === 'web' ? 'web' : 'mobile',
    });
    const { oauth_state: _oauthState, ...publicResult } = result;
    return publicResult;
  }

  /** OAuth callback from Loginus. Returns HTML for WebView (postMessage) or standalone web PWA. */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Req() req: Express.Request,
    @Res() res: Express.Response,
  ) {
    console.log('[Auth] GET /callback ← Loginus redirect', {
      hasCode: !!code,
      codeLen: code?.length,
      error: error || null,
      platform: state?.startsWith('web:') ? 'web' : 'mobile',
    });
    const redirectUri =
      process.env.LOGINUS_REDIRECT_URI ||
      'http://localhost:4000/api/auth/callback';
    const isWeb = typeof state === 'string' && state.startsWith('web:');
    if (isWeb) {
      const cookieState = readRequestCookie(req, 'chatus_oauth_state');
      clearOAuthStateCookie(res);
      if (!cookieState || cookieState !== state) {
        const allowDevWithoutCookie =
          process.env.NODE_ENV !== 'production' &&
          process.env.CHATUS_OAUTH_DEV_SKIP_STATE === 'true' &&
          !cookieState &&
          !!state;
        if (!allowDevWithoutCookie) {
          const invalidPayload = { type: 'auth', error: 'invalid_state' };
          res.type('text/html').send(this.buildWebCallbackHtml(invalidPayload));
          return;
        }
      }
    }

    const payload = error
      ? { type: 'auth', error }
      : !code
        ? { type: 'auth', error: 'missing_code' }
        : { type: 'auth', code, redirect_uri: redirectUri };

    if (isWeb) {
      const html = this.buildWebCallbackHtml(payload);
      res.type('text/html').send(html);
      return;
    }

    const payloadEncoded = encodeURIComponent(JSON.stringify(payload));
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Завершение входа...</p><div id="p" data-auth="${payloadEncoded}"></div><script>
(function(){
  var payload = JSON.parse(decodeURIComponent(document.getElementById('p').getAttribute('data-auth')));
  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } else {
    var q = payload.error ? 'error=' + encodeURIComponent(payload.error) : 'code=' + encodeURIComponent(payload.code);
    window.location = 'messenger://auth/callback?' + q;
  }
})();
</script></body></html>`;
    res.type('text/html').send(html);
  }

  private buildWebCallbackHtml(payload: {
    type: string;
    error?: string;
    code?: string;
    redirect_uri?: string;
  }): string {
    const payloadEncoded = encodeURIComponent(JSON.stringify(payload));
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Завершение входа…</p><div id="p" data-auth="${payloadEncoded}"></div><script>
(function(){
  var payload = JSON.parse(decodeURIComponent(document.getElementById('p').getAttribute('data-auth')));
  if (payload.error) {
    window.location.replace('/app/?auth_error=' + encodeURIComponent(payload.error));
    return;
  }
  fetch('/api/auth/loginus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: payload.code, redirect_uri: payload.redirect_uri })
  })
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) {
          var msg = data && data.message ? (Array.isArray(data.message) ? data.message.join(', ') : data.message) : 'exchange_failed';
          throw new Error(msg);
        }
        return data;
      });
    })
    .then(function(session) {
      var payload = JSON.stringify({
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user,
        access_token: session.access_token
      });
      try { localStorage.setItem('${CHATUS_WEB_SESSION_KEY}', payload); } catch (e) {}
      try { sessionStorage.removeItem('${CHATUS_WEB_SESSION_KEY}'); } catch (e) {}
      window.location.replace('/app/');
    })
    .catch(function(err) {
      var msg = err && err.message ? err.message : 'exchange_failed';
      window.location.replace('/app/?auth_error=' + encodeURIComponent(msg));
    });
})();
</script></body></html>`;
  }

  @Get('logout-done')
  logoutDone(@Res() res: Express.Response) {
    const payload = { type: 'logout_done' };
    const payloadEncoded = encodeURIComponent(JSON.stringify(payload));
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Выход выполнен.</p><div id="p" data-payload="${payloadEncoded}"></div><script>
(function(){
  var payload = JSON.parse(decodeURIComponent(document.getElementById('p').getAttribute('data-payload')));
  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } else {
    window.location = 'messenger://logout';
  }
})();
</script></body></html>`;
    res.type('text/html').send(html);
  }

  @Post('loginus/exchange')
  @HttpCode(HttpStatus.OK)
  async loginusExchange(@Body() dto: LoginusExchangeDto) {
    console.log('[Auth] POST /loginus/exchange ← embed initData', {
      hasInitData: !!dto?.init_data,
    });
    const result = await this.authService.loginWithInitData(dto.init_data, dto.profile);
    console.log('[Auth] POST /loginus/exchange → success', {
      userId: result.user?.id,
    });
    return result;
  }

  @Post('loginus/sync-profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async loginusSyncProfile(
    @Request() req: { user: { id: string } },
    @Body() dto: LoginusSyncProfileDto,
  ) {
    const user = await this.authService.syncProfileFromInitData(
      req.user.id,
      dto.init_data,
      dto.profile,
    );
    return { user };
  }

  @Post('loginus')
  @HttpCode(HttpStatus.OK)
  async loginus(@Body() dto: LoginusDto) {
    console.log('[Auth] POST /loginus ← app exchange code', {
      hasCode: !!dto?.code,
      redirect_uri: dto?.redirect_uri,
    });
    const result = await this.authService.loginWithCode(
      dto.code,
      dto.redirect_uri,
    );
    console.log('[Auth] POST /loginus → success', { userId: result.user?.id });
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Request() req: { user: { id: string } },
    @Body() dto?: LogoutDto,
  ) {
    return this.authService.logout(req.user.id, dto?.id_token);
  }
}
