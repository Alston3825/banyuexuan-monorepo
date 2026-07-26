import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : { message: '服务器内部错误' };
    const message = typeof body === 'string' ? body : (body as any)?.message ?? '请求失败';

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: exception instanceof HttpException ? exception.name : 'InternalServerError',
      timestamp: new Date().toISOString(),
    });
  }
}
