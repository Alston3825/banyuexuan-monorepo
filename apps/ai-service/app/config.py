from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """模型网关配置。真实密钥只写在部署环境变量里，见 .env.example 说明。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8000

    # 服务间认证：apps/api 调用本服务时携带的共享密钥（见业务规则确认记录"P4模型网关"章节，
    # V1 用共享密钥而非完整服务间 OAuth）。
    internal_api_key: Optional[str] = None

    # 主/备供应商：热切换与降级顺序，见 3.3.1 节"多供应商热切换与降级"。
    primary_provider: str = "volcengine"
    fallback_provider: Optional[str] = "minimax"

    # 火山引擎方舟(Ark)
    volcengine_api_key: Optional[str] = None
    volcengine_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    volcengine_endpoint_id: Optional[str] = None  # 控制台创建的推理接入点 ID，如 ep-xxxxxxxx-xxxxx
    volcengine_embedding_endpoint_id: Optional[str] = None  # embedding 模型的推理接入点 ID

    # MiniMax
    minimax_api_key: Optional[str] = None
    minimax_group_id: Optional[str] = None
    minimax_base_url: str = "https://api.minimax.chat/v1"
    minimax_model: str = "abab6.5s-chat"
    minimax_embedding_model: str = "embo-01"

    request_timeout_seconds: float = 30.0


settings = Settings()
