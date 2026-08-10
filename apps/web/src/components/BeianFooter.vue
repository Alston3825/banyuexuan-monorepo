<script setup lang="ts">
// 网站备案信息公示：ICP备案号 + 公安联网备案号，按各自监管方要求的固定文案/链接展示，
// 不要改动文案措辞或链接地址——这是对外公示的法定信息，不是可自由编辑的UI文案。
</script>

<template>
  <div class="beian-footer">
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">陕ICP备2026018077号-1</a>
    <span class="divider">|</span>
    <a
      href="https://beian.mps.gov.cn/#/query/webSearch?code=61011302002635"
      target="_blank"
      rel="noreferrer"
      class="gongan-link"
    >
      <img src="/gongan-beian-icon.png" alt="" class="gongan-icon" />
      陕公网安备61011302002635号
    </a>
  </div>
</template>

<style scoped>
.beian-footer {
  text-align: center;
  font-size: 12px;
  color: #999;
  padding: 12px 0 4px;
}
.beian-footer a {
  color: inherit;
  text-decoration: none;
}
.beian-footer a:hover {
  color: #666;
  text-decoration: underline;
}
.divider {
  margin: 0 8px;
  color: #ccc;
}
.gongan-link {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.gongan-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
</style>
