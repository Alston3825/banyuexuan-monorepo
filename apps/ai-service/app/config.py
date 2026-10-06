from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """模型网关配置。真实密钥只写在部署环境变量里，见 .env.example 说明。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8000

    # production 时强制要求 internal_api_key 非空（见 main.py 启动校验），
    # 避免生产环境忘记设置共享密钥导致本服务对内网任何调用方不设防
    environment: str = "development"

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

    # DeepSeek（境内合规供应商，只提供对话模型，没有embedding接口——见providers/deepseek.py）
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # 火山引擎 Agent Plan 专属通道（Anthropic 格式，POST {base_url}/v1/messages，Bearer 认证）。
    # 专属密钥只能用这个地址，不能用上面 /api/v3 那套；目前只用来做合同图片识别（读图）。
    # 注意：Agent Plan 官方定位是编程工具套餐，正式上线前建议换成方舟"按量计费"密钥，见业务记录。
    volcengine_plan_api_key: Optional[str] = None
    volcengine_plan_base_url: str = "https://ark.cn-beijing.volces.com/api/plan"
    volcengine_plan_model: Optional[str] = None

    request_timeout_seconds: float = 30.0
    # 读图识别单次请求更慢（图片大、输出长），单独放宽超时
    vision_request_timeout_seconds: float = 120.0


settings = Settings()
