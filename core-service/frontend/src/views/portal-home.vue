<template>
  <main class="portal-home">
    <section class="hero">
      <h1>欢迎使用 MindPlus AI</h1>
      <p>这里是工作台首页。你可以从这里快速进入AIPPT功能或文献助手主页。</p>
    </section>

    <section class="feature-grid">
      <article class="feature-card">
        <div class="card-tag">Feature 01</div>
        <h2>AIPPT</h2>
        <p class="desc">
          适用于演示文稿创建与管理，支持从内容生成到编辑完善的完整制作流程。
        </p>
        <ul>
          <li>统一管理你的演示文稿</li>
          <li>支持快速创建和继续编辑</li>
          <li>适配日常汇报与方案展示</li>
        </ul>
        <button class="primary-btn" @click="goAiPpt">
          前往 AIPPT 主页
        </button>
      </article>

      <article class="feature-card">
        <div class="card-tag">Feature 02</div>
        <h2>文献助手</h2>
        <p class="desc">
          面向论文和技术文档场景，帮助你进行高效阅读、重点提炼与知识整理。
        </p>
        <ul>
          <li>专注文献阅读与分析流程</li>
          <li>支持历史记录与全局设置</li>
          <li>快速回到阅读工作区</li>
        </ul>
        <button class="primary-btn" @click="goLiterature">
          前往文献助手首页
        </button>
      </article>
    </section>

    <section class="section">
      <PlatformNoticeSection />
    </section>
  </main>
</template>

<script setup>
import { useRouter } from 'vue-router'
import PlatformNoticeSection from '@/components/PlatformNoticeSection.vue'

const router = useRouter()

const goLiterature = () => {
  router.push({ name: 'LiteratureHome' })
}

const goAiPpt = () => {
  router.push({ name: 'Home' })
}
</script>

<style scoped>
.portal-home {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  background: #f8fbff;
}

.section {
  margin-top: 24px;
}

.portal-home::-webkit-scrollbar {
  display: none;
}

.hero {
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  padding: 28px;
  margin-bottom: 24px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.hero h1 {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  font-weight: 700;
}

.hero p {
  margin: 12px 0 0;
  color: #475569;
  font-size: 15px;
  line-height: 1.75;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.feature-card {
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.14);
}

.card-tag {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  margin-bottom: 12px;
}

.feature-card h2 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
}

.desc {
  margin: 12px 0 14px;
  color: #475569;
  line-height: 1.75;
}

.feature-card ul {
  margin: 0 0 20px;
  padding-left: 18px;
  color: #334155;
  line-height: 1.8;
}

.primary-btn {
  border-radius: 10px;
  height: 40px;
  padding: 0 16px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
}

.primary-btn:hover {
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
}

@media (max-width: 1024px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .portal-home {
    padding: 16px;
  }

  .hero {
    padding: 20px;
  }

  .hero h1 {
    font-size: 24px;
  }

  .feature-card {
    padding: 18px;
  }
}
</style>
