from fastapi import Header, HTTPException, status

from .config import settings


async def verify_internal_api_key(x_internal_api_key: str = Header(default="")) -> None:
    """
    apps/api 与 apps/ai-service 之间用共享密钥校验（V1 不做完整服务间 OAuth，
    见业务规则确认记录"P4模型网关"章节）。密钥未配置时视为开发环境，放行但记录。
    """
    if settings.internal_api_key and x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="内部服务密钥校验失败")
