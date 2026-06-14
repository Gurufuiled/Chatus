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
} from '@nestjs/common';
import * as Express from 'express';
import { AuthService } from './auth.service';
import { LoginusDto } from './dto/loginus.dto';
import { LoginusExchangeDto } from './dto/loginus-exchange.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login-url')
  getLoginUrl(@Query('redirect_uri') redirectUriParam?: string) {
    const result = this.authService.getLoginUrl(redirectUriParam);
    console.log('[Auth] GET /login-url →', {
      url: result.url?.slice(0, 80) + '...',
      redirect_uri: result.redirect_uri,
    });
    return result;
  }

  /** OAuth callback from Loginus. Returns HTML for WebView (postMessage) */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Express.Response,
  ) {
    console.log('[Auth] GET /callback ← Loginus redirect', {
      hasCode: !!code,
      codeLen: code?.length,
      error: error || null,
    });
    const redirectUri =
      process.env.LOGINUS_REDIRECT_URI ||
      'http://localhost:4000/api/auth/callback';
    const payload = error
      ? { type: 'auth', error }
      : !code
        ? { type: 'auth', error: 'missing_code' }
        : { type: 'auth', code, redirect_uri: redirectUri };
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
    const result = await this.authService.loginWithInitData(dto.init_data);
    console.log('[Auth] POST /loginus/exchange → success', {
      userId: result.user?.id,
    });
    return result;
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
