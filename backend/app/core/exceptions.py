from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    status = 400
    code = 'BAD_REQUEST'

    def __init__(self, message: str, *, code: str | None = None, status: int | None = None, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.code
        self.status = status or self.status
        self.details = details or {}


class NotFound(AppError): status, code = 404, 'NOT_FOUND'
class Forbidden(AppError): status, code = 403, 'FORBIDDEN'
class Unauthorized(AppError): status, code = 401, 'UNAUTHORIZED'
class Conflict(AppError): status, code = 409, 'CONFLICT'
class RateLimited(AppError): status, code = 429, 'RATE_LIMITED'
class AIUnavailable(AppError): status, code = 503, 'AI_NOT_CONFIGURED'
class AIError(AppError): status, code = 502, 'AI_ERROR'


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    return {'error': {'code': code, 'message': message, 'details': details or {}}}


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app(_: Request, e: AppError):
        return JSONResponse(error_body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        errs = [{'loc': list(x.get('loc', [])), 'msg': x.get('msg')} for x in e.errors()]
        return JSONResponse(error_body('VALIDATION_ERROR', 'Invalid request', {'errors': errs}), status_code=422)
