<template>
  <main class="opendraft-assistant-page">
    
    <!-- PAGE: LANDING -->
    <div id="landing">
      <div class="landing-top-left">
        <section class="account-card landing-account-card">
          <div class="user-avatar">&#128100;</div>
          <p class="account-line">
            <span id="landing-account-label-user" class="account-label">用户名：</span>
            <span class="account-value" data-account-username>--</span>
          </p>
          <div class="credits-row">
            <span class="credits-text">
              <span id="landing-account-label-credits" class="account-label">剩余credits：</span>
              <span class="account-value" data-account-credits>--</span>
            </span>
            <button class="refresh-btn" type="button" data-account-refresh>刷新</button>
          </div>
          <div class="account-actions">
            <button id="landing-account-btn-profile" class="account-btn secondary" type="button" @click="openMindUserProfile">
              查看详情
            </button>
            <button id="landing-account-btn-logout" class="account-btn danger" type="button" @click="handleLogout">
              注销登录
            </button>
          </div>
        </section>
        <button class="btn-my-papers" type="button" @click="showMyPapers" data-i18n="my_papers_btn">&#128196; 我的论文</button>
      </div>
      <div class="landing-top">
        <button class="btn-lang active" type="button" data-lang="zh" @click="setLang('zh')">中文</button>
        <button class="btn-lang" type="button" data-lang="en" @click="setLang('en')">EN</button>
      </div>
      <div class="landing-title" data-i18n="title">AI 论文生成器</div>
      <div class="landing-sub" data-i18n="subtitle">描述你的研究课题，AI 将为你生成一篇完整的学术论文</div>
      <div class="input-box">
        <textarea id="topic-input" rows="2" data-i18n-placeholder="topic_placeholder" placeholder="输入你的研究课题，例如：人工智能对现代教育的影响..."></textarea>
        <div class="input-actions">
          <button class="btn-generate" id="btn-go" type="button" @click="startWriting" data-i18n="start_btn">开始撰写</button>
        </div>
      </div>
    </div>
    
    <!-- PAGE: MY PAPERS -->
    <div id="my-papers">
      <div class="papers-header">
        <button class="papers-back" type="button" @click="backToLanding">&larr;</button>
        <h1 data-i18n="my_papers_title">我的论文</h1>
        <button class="btn-new-paper" type="button" @click="newPaper" data-i18n="new_paper_btn">+ 新的论文</button>
      </div>
      <div class="papers-body">
        <div class="papers-grid" id="papers-grid"></div>
      </div>
    </div>
    
    <!-- PAGE: WORKSPACE -->
    <div id="workspace">
      <div class="topbar">
        <button class="topbar-back" type="button" @click="goBack">&larr;</button>
        <div class="topbar-title" id="ws-title"></div>
        <button class="topbar-my-papers" type="button" @click="showMyPapers" data-i18n="my_papers_btn">&#128196; 我的论文</button>
        <div class="topbar-account">
          <span id="ws-username" data-account-username>用户：--</span>
          <span id="ws-credits" data-account-credits>Credits：--</span>
          <button id="ws-refresh-credits" class="topbar-credits-btn" type="button" data-account-refresh>刷新</button>
        </div>
        <div class="topbar-status"><div class="status-dot" id="ws-dot"></div><span id="ws-status-text">设置中</span></div>
        <div class="topbar-progress"><div class="topbar-progress-fill" id="ws-progress"></div></div>
        <div class="topbar-time" id="ws-time">00:00</div>
      </div>
      <div class="panels">
        <div class="panel-left">
          <div class="panel-left-header">
            <span class="tab active" id="tab-activity" data-i18n="tab_activity">AI 工作流</span>
          </div>
          <!-- Completed sections cards -->
          <div id="sections-panel">
            <div class="sections-label" data-i18n="sections_label">已完成章节</div>
            <div class="sections-grid" id="sections-grid"></div>
            <div class="sections-toggle"><button class="sections-toggle-btn" id="sections-toggle-btn" type="button" @click="toggleSectionsPanel">▲</button></div>
          </div>
          <div id="activity-container"></div>
          <!-- Settings form (shown first, replaced by activity after confirm) -->
          <div class="settings-form-panel" id="settings-form-panel" style="display:none;">
            <div class="sf-section">
              <div class="sf-section-title" data-i18n="paper_settings">论文设置</div>
              <div class="sf-grid">
                <div class="sf-field"><label data-i18n="label_language">论文语言</label><select id="sf-lang"><option value="zh">中文</option><option value="en">English</option></select></div>
                <div class="sf-field"><label data-i18n="label_level">学术等级</label><select id="sf-level"><option value="research_paper" data-i18n-option="level_research">研究论文</option><option value="bachelor" data-i18n-option="level_bachelor">本科</option><option value="master" data-i18n-option="level_master">硕士</option><option value="phd" data-i18n-option="level_phd">博士</option></select></div>
              </div>
              <div class="sf-grid" style="margin-top:0.65rem">
                <div class="sf-field"><label data-i18n="label_words">目标字数</label><select id="sf-words"><option value="" data-i18n-option="default_val">默认</option><option value="3000">~3,000</option><option value="5000">~5,000</option><option value="8000">~8,000</option><option value="10000">~10,000</option><option value="15000">~15,000</option><option value="20000">~20,000</option></select></div>
                <div class="sf-field"><label data-i18n="label_citations">目标引用数</label><select id="sf-citations"><option value="" data-i18n-option="default_val">默认</option><option value="10">~10</option><option value="15">~15</option><option value="20">~20</option><option value="30">~30</option><option value="50">~50</option></select></div>
              </div>
            </div>
            <div class="sf-section">
              <div class="sf-section-title" data-i18n="author_info">作者信息（可选）</div>
              <div class="sf-grid"><div class="sf-field"><label data-i18n="label_author">作者姓名</label><input type="text" id="sf-author"></div><div class="sf-field"><label data-i18n="label_institution">学校 / 机构</label><input type="text" id="sf-institution"></div></div>
              <div class="sf-grid" style="margin-top:0.65rem"><div class="sf-field"><label data-i18n="label_department">院系</label><input type="text" id="sf-department"></div><div class="sf-field"><label data-i18n="label_faculty">学院</label><input type="text" id="sf-faculty"></div></div>
              <div class="sf-grid" style="margin-top:0.65rem"><div class="sf-field"><label data-i18n="label_advisor">指导老师</label><input type="text" id="sf-advisor"></div><div class="sf-field"><label data-i18n="label_examiner">第二审阅人</label><input type="text" id="sf-examiner"></div></div>
              <div class="sf-grid" style="margin-top:0.65rem"><div class="sf-field"><label data-i18n="label_location">所在地</label><input type="text" id="sf-location"></div><div class="sf-field"><label data-i18n="label_studentid">学号</label><input type="text" id="sf-studentid"></div></div>
            </div>
            <div class="sf-section">
              <div class="sf-section-title" data-i18n="output_formats">输出格式</div>
              <div class="sf-formats"><label><input type="checkbox" class="fmt-check" value="docx" checked> Word</label><label><input type="checkbox" class="fmt-check" value="md" checked> Markdown</label></div>
            </div>
            <div class="sf-section">
              <div class="sf-section-title" data-i18n="extra_desc">补充说明（可选）</div>
              <div class="sf-field"><textarea id="sf-blurb" rows="2" data-i18n-placeholder="blurb_placeholder" placeholder="输入更多论文要求..."></textarea></div>
            </div>
            <button class="btn-start-writing" id="btn-confirm-settings" type="button" @click="confirmSettingsAndStart" data-i18n="confirm_start_btn">确认并开始创作</button>
            <p class="assistant-estimate-tip" id="assistant-estimate-tip">此次调用预估扣除 -- credits</p>
          </div>
        </div>
        <div class="panel-right">
          <div class="panel-right-header">
            <div class="panel-right-tabs">
              <button class="active" id="tab-preview" type="button" @click="switchRightTab('preview')" data-i18n="tab_preview">预览</button>
              <button id="tab-editor" type="button" @click="switchRightTab('editor')" data-i18n="tab_edit">编辑</button>
            </div>
            <div class="panel-right-actions">
              <button class="btn-action" id="btn-save" type="button" @click="saveEdits" disabled data-i18n="btn_save">保存</button>
            </div>
          </div>
          <div id="preview-area"><div class="placeholder"><div class="placeholder-icon">&#9997;</div><div data-i18n="placeholder_wait">请先完成左侧论文设置...</div></div></div>
          <div id="editor-area"><textarea id="md-editor" spellcheck="false"></textarea></div>
          <!-- Download bar -->
          <div class="download-bar" id="download-bar">
            <span data-i18n="dl_success">论文生成成功！</span>
            <button class="btn-dl secondary" id="dl-md" type="button" @click="downloadFile('md')">Markdown</button>
            <button class="btn-dl secondary" id="dl-docx" type="button" @click="downloadFile('docx')">Word</button>
          </div>
        </div>
      </div>
    </div>
    
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { CREDITS_CHANGED_EVENT } from '@/utils/credits-events'
import {
  buildMindUserLoginUrl,
  buildMindUserProfileUrl,
  clearMindPlusLocalAuth,
  getMindUserBaseUrl,
  getMindUserServiceKey,
} from '@/utils/minduser-auth'
import { formatCreditsForDisplay, getAssistantLevelBillingPrice } from '@/utils/billing-estimate'
// ===== I18N =====
const I18N = {
  zh: {
    title:'AI 论文生成器', subtitle:'描述你的研究课题，AI 将为你生成一篇完整的学术论文',
    topic_placeholder:'输入你的研究课题，例如：人工智能对现代教育的影响...',
    start_btn:'开始撰写', starting_btn:'跳转中...',
    confirm_start_btn:'确认并开始创作', confirming_btn:'启动中...',
    paper_settings:'论文设置', label_language:'论文语言', label_level:'学术等级',
    level_research:'研究论文', level_bachelor:'本科', level_master:'硕士', level_phd:'博士',
    label_words:'目标字数', label_citations:'目标引用数', default_val:'默认',
    author_info:'作者信息（可选）', label_author:'作者姓名', label_institution:'学校 / 机构',
    label_department:'院系', label_faculty:'学院', label_advisor:'指导老师', label_examiner:'第二审阅人',
    label_location:'所在地', label_studentid:'学号', output_formats:'输出格式',
    extra_desc:'补充说明（可选）', blurb_placeholder:'输入更多论文要求...',
    status_processing:'处理中', status_complete:'已完成', status_error:'出错', status_review:'等待审阅',
    status_settings:'设置中',
    tab_activity:'AI 工作流', tab_preview:'预览', tab_edit:'编辑',
    btn_save:'保存', btn_saved:'已保存！', btn_print:'打印 / PDF',
    btn_approve:'确认并继续',
    placeholder_wait:'请先完成左侧论文设置...', placeholder_generating:'等待论文生成...',
    placeholder_outline:'请在此编辑大纲，确认后点击下方按钮开始写作',
    dl_success:'论文生成成功！', dl_pdf:'下载 PDF',
    ws_generating:'生成中...', ws_recovering:'恢复中...',
    phase_init:'初始化', phase_research:'学术研究', phase_outline:'论文架构',
    phase_writing:'论文撰写', phase_compile:'文档编译', phase_export:'导出文件', phase_done:'完成',
    outline_review_msg:'大纲已生成，请在右侧编辑并确认',
    chapter_review_msg:'章节已完成：',
    approve_outline:'确认大纲，开始写作',
    approve_chapter:'确认章节，继续下一步',
    my_papers_btn:'&#128196; 我的论文', my_papers_title:'我的论文',
    new_paper_btn:'+ 新的论文',
    paper_status_done:'已完成', paper_status_running:'撰写中', paper_status_error:'出错', paper_status_cancelled:'已取消',
    papers_empty:'还没有论文，点击上方"新的论文"开始创作吧！',
    paper_created:'创建于',
    ai_thinking:'AI 正在思考',
    thinking_analyzing:'正在分析您的研究课题...',
    thinking_planning:'正在规划论文结构...',
    thinking_outline_start:'开始生成论文大纲...',
    thinking_reviewing_topic:'正在审视课题方向与研究意义...',
    thinking_designing_chapters:'正在设计章节结构与逻辑框架...',
    thinking_detailing_sections:'正在细化各章节要点...',
    thinking_outline_done:'大纲生成完成，请在右侧审阅编辑',
    chat_placeholder:'让AI帮你修改当前章节...',
    chat_send:'发送',
    chat_applying:'AI正在修改...',
    chat_done:'修改完成',
    chat_error:'修改失败',
    chat_tag_intro:'引言', chat_tag_litrev:'文献综述', chat_tag_method:'研究方法',
    chat_tag_results:'分析与结果', chat_tag_discuss:'讨论', chat_tag_conclusion:'结论', chat_tag_outline:'大纲',
    sections_label:'已完成章节（点击查看/编辑）',
    sec_outline:'大纲', sec_introduction:'引言', sec_literature_review:'文献综述',
    sec_methodology:'研究方法', sec_analysis_results:'分析与结果', sec_discussion:'讨论',
    sec_conclusion:'结论', sec_main_body:'正文', sec_appendices:'附录',
    click_to_view:'点击查看',
  },
  en: {
    title:'AI Paper Generator', subtitle:'Describe your research topic, and AI will generate a complete academic paper',
    topic_placeholder:'Enter your research topic, e.g.: The impact of artificial intelligence on modern education...',
    start_btn:'Start Writing', starting_btn:'Loading...',
    confirm_start_btn:'Confirm & Start Writing', confirming_btn:'Starting...',
    paper_settings:'Paper Settings', label_language:'Paper Language', label_level:'Academic Level',
    level_research:'Research Paper', level_bachelor:'Bachelor', level_master:'Master', level_phd:'PhD',
    label_words:'Target Word Count', label_citations:'Target Citations', default_val:'Default',
    author_info:'Author Information (Optional)', label_author:'Author Name', label_institution:'Institution',
    label_department:'Department', label_faculty:'Faculty', label_advisor:'Advisor', label_examiner:'Second Examiner',
    label_location:'Location', label_studentid:'Student ID', output_formats:'Output Formats',
    extra_desc:'Additional Description (Optional)', blurb_placeholder:'Provide more details...',
    status_processing:'Processing', status_complete:'Complete', status_error:'Error', status_review:'Awaiting Review',
    status_settings:'Settings',
    tab_activity:'AI Workflow', tab_preview:'Preview', tab_edit:'Edit',
    btn_save:'Save', btn_saved:'Saved!', btn_print:'Print / PDF',
    btn_approve:'Approve & Continue',
    placeholder_wait:'Complete paper settings on the left...', placeholder_generating:'Waiting for paper generation...',
    placeholder_outline:'Edit the outline on the right, then approve to start writing',
    dl_success:'Paper generated successfully!', dl_pdf:'Download PDF',
    ws_generating:'Generating...', ws_recovering:'Recovering...',
    phase_init:'Initialization', phase_research:'Research', phase_outline:'Outline',
    phase_writing:'Writing', phase_compile:'Compiling', phase_export:'Exporting', phase_done:'Complete',
    outline_review_msg:'Outline generated. Edit on the right and approve.',
    chapter_review_msg:'Chapter complete: ',
    approve_outline:'Approve Outline & Start Writing',
    approve_chapter:'Approve & Continue Next',
    my_papers_btn:'&#128196; My Papers', my_papers_title:'My Papers',
    new_paper_btn:'+ New Paper',
    paper_status_done:'Completed', paper_status_running:'Writing', paper_status_error:'Error', paper_status_cancelled:'Cancelled',
    papers_empty:'No papers yet. Click "New Paper" above to start!',
    paper_created:'Created',
    ai_thinking:'AI is thinking',
    thinking_analyzing:'Analyzing your research topic...',
    thinking_planning:'Planning paper structure...',
    thinking_outline_start:'Starting outline generation...',
    thinking_reviewing_topic:'Reviewing topic direction and research significance...',
    thinking_designing_chapters:'Designing chapter structure and logical framework...',
    thinking_detailing_sections:'Detailing key points for each chapter...',
    thinking_outline_done:'Outline ready. Please review and edit on the right.',
    chat_placeholder:'Ask AI to modify this section...',
    chat_send:'Send',
    chat_applying:'AI is modifying...',
    chat_done:'Done',
    chat_error:'Modification failed',
    chat_tag_intro:'Introduction', chat_tag_litrev:'Literature Review', chat_tag_method:'Methodology',
    chat_tag_results:'Analysis & Results', chat_tag_discuss:'Discussion', chat_tag_conclusion:'Conclusion', chat_tag_outline:'Outline',
    sections_label:'Completed Sections (click to view/edit)',
    sec_outline:'Outline', sec_introduction:'Introduction', sec_literature_review:'Literature Review',
    sec_methodology:'Methodology', sec_analysis_results:'Analysis & Results', sec_discussion:'Discussion',
    sec_conclusion:'Conclusion', sec_main_body:'Main Body', sec_appendices:'Appendices',
    click_to_view:'Click to view',
  }
};

const MSG_ZH = {
  'Generation started':'开始生成论文','Loading AI model':'正在加载 AI 模型...','AI model ready':'AI 模型加载完成',
  'Starting academic research':'开始学术研究','Querying Crossref, Semantic Scholar & AI search in parallel':'正在并行查询学术数据库...',
  'Summarizing research findings':'正在总结研究成果...','Research summaries complete':'研究总结完成',
  'Organizing research papers':'正在整理研究论文...','All research papers organized':'所有研究论文整理完成',
  'Analyzing research gaps':'正在分析研究空白...','Research gaps identified':'研究空白已识别',
  'Preparing thesis structure':'正在准备论文结构...','Designing thesis structure':'正在设计论文结构','Creating thesis outline':'正在创建论文大纲...',
  'Using approved outline':'使用已审批的大纲','Outline created':'论文大纲创建完成',
  'Processing citations and references':'正在处理引用文献...','citations ready':'引用文献准备就绪',
  'Outline ready for review':'大纲已准备好，等待审阅',
  'Starting paper writing':'开始论文撰写','Starting chapter composition':'开始章节撰写',
  'Writing Introduction chapter':'正在撰写引言...','Introduction complete':'引言完成',
  'Writing Literature Review section':'正在撰写文献综述...','Literature Review complete':'文献综述完成',
  'Writing Methodology section':'正在撰写研究方法...','Methodology complete':'研究方法完成',
  'Writing Analysis & Results section':'正在撰写分析与结果...','Analysis & Results complete':'分析与结果完成',
  'Writing Discussion section':'正在撰写讨论部分...','Discussion complete':'讨论部分完成',
  'Merging sections into Main Body':'正在合并各章节...',
  'Writing Conclusion chapter':'正在撰写结论...','Conclusion complete':'结论完成',
  'ready for review':'等待审阅',
  'Starting document compilation':'开始文档编译','Compiling citations and references':'正在编译引用...',
  'Citations compiled':'引用编译完成','Generating abstract':'正在生成摘要...','Abstract generated':'摘要生成完成',
  'Starting document export':'开始导出文档','Generating PDF':'正在生成 PDF...',
  'PDF skipped':'PDF 跳过','PDF ready':'PDF 已就绪','Creating Word document':'正在创建 Word 文档...',
  'Word document ready':'Word 文档已就绪','ZIP bundle created':'ZIP 已创建','Generation complete':'论文生成完成！',
  'Found:':'发现文献：','more sources':'篇更多文献',
};

let currentLang = localStorage.getItem('opendraft_lang') || 'zh';
function t(key) { return (I18N[currentLang]||I18N.zh)[key] || I18N.zh[key] || key; }
function translateMsg(msg) {
  if (currentLang === 'en') return msg;
  const stripped = msg.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅❌⚠️🔍🔗🏗️✍️📝📋📄📚📑📦🎉🚀🤖🔧📖]+\s*/u, '');
  for (const [en, zh] of Object.entries(MSG_ZH)) {
    if (stripped.includes(en)) {
      if (en === 'Found:') return '📄 发现文献：' + stripped.substring(stripped.indexOf('Found:')+6).trim();
      if (en === 'more sources') return msg.replace('more sources','篇更多文献');
      return zh;
    }
  }
  return msg;
}
function setLang(lang) {
  currentLang = lang; localStorage.setItem('opendraft_lang', lang); applyI18n();
  updateDefaultHints();
  document.querySelectorAll('.btn-lang').forEach(b => b.classList.toggle('active', b.dataset.lang===lang));
  document.querySelectorAll('.activity-text[data-raw]').forEach(el => el.textContent = translateMsg(el.getAttribute('data-raw')));
  document.querySelectorAll('.phase-header-label[data-phase]').forEach(el => el.textContent = t('phase_'+el.getAttribute('data-phase')));
  renderLandingAccountTexts()
  renderAccountUsername()
  setAccountRefreshBtnState(accountRefreshing)
}
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.getAttribute('data-i18n'));
    if (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'H1') el.innerHTML = val;
    else el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.getAttribute('data-i18n-placeholder')));
  document.querySelectorAll('[data-i18n-option]').forEach(el => el.textContent = t(el.getAttribute('data-i18n-option')));
  document.title = t('title');
}

function normalizeApiBase(rawBase) {
  const text = String(rawBase || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text.replace(/\/+$/, '')
  if (text.startsWith('/')) return `/${text.replace(/^\/+/, '').replace(/\/+$/, '')}`
  return text.replace(/\/+$/, '')
}

function remapLegacyLocalApiBase(rawBase) {
  const text = normalizeApiBase(rawBase)
  if (!text) return ''
  return text.replace(/^http:\/\/(localhost|127\.0\.0\.1):3002(?=\/|$)/i, 'http://$1:3001')
}

function resolveBaseApiPrefix() {
  try {
    const g = globalThis
    const fromGlobal = g && g.__PX_BASE_API_URL__
    const fromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('px_base_api_url') : ''
    const fromBuild = g && g.process && g.process.env ? g.process.env.BASE_API_URL : ''
    const candidate = remapLegacyLocalApiBase(fromGlobal || fromStorage || fromBuild)
    if (candidate) return candidate.endsWith('/api') ? candidate : `${candidate}/api`
  } catch (error) {
    void error
  }

  // 本地兼容：页面若由 3002 提供，但 API 在 3001，自动切换至 3001。
  if (typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').trim()
    const port = String(window.location.port || '').trim()
    if ((host === 'localhost' || host === '127.0.0.1') && port === '3002') {
      return `http://${host}:3001/api`
    }
  }

  return '/api'
}

const OPENDRAFT_API_PREFIX = `${resolveBaseApiPrefix()}/opendraft`

function resolveToken() {
  return String(localStorage.getItem('jwt_token') || '').trim()
}

function apiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`
  const token = resolveToken()
  if (!token) return `${OPENDRAFT_API_PREFIX}${normalizedPath}`
  const separator = normalizedPath.includes('?') ? '&' : '?'
  return `${OPENDRAFT_API_PREFIX}${normalizedPath}${separator}token=${encodeURIComponent(token)}`
}

let accountUsernameEls = []
let accountCreditsEls = []
let accountRefreshBtnEls = []
let accountRefreshHandlers = []
let accountCreditsChangedHandler = null
let accountStorageHandler = null
let accountRefreshing = false

function resolveAccountIdentity() {
  const username = String(localStorage.getItem('username') || '').trim()
  const uid = String(localStorage.getItem('uid') || '').trim()
  const displayName = username || (uid ? `user_${uid.slice(-6)}` : '--')
  return { username, uid, displayName }
}

function renderLandingAccountTexts() {
  const userLabelEl = document.getElementById('landing-account-label-user')
  const creditsLabelEl = document.getElementById('landing-account-label-credits')
  const profileBtnEl = document.getElementById('landing-account-btn-profile')
  const logoutBtnEl = document.getElementById('landing-account-btn-logout')

  if (currentLang === 'en') {
    if (userLabelEl) userLabelEl.textContent = 'User:'
    if (creditsLabelEl) creditsLabelEl.textContent = 'Credits:'
    if (profileBtnEl) profileBtnEl.textContent = 'Profile'
    if (logoutBtnEl) logoutBtnEl.textContent = 'Logout'
    return
  }

  if (userLabelEl) userLabelEl.textContent = '用户名：'
  if (creditsLabelEl) creditsLabelEl.textContent = '剩余credits：'
  if (profileBtnEl) profileBtnEl.textContent = '查看详情'
  if (logoutBtnEl) logoutBtnEl.textContent = '注销登录'
}

function renderAccountUsername() {
  const { displayName } = resolveAccountIdentity()
  const label = currentLang === 'en' ? 'User' : '用户'
  accountUsernameEls.forEach((element) => {
    if (!element) return
    if (element.id === 'ws-username') {
      element.textContent = `${label}：${displayName}`
      return
    }
    element.textContent = displayName
  })
}

function renderAccountCreditsLabel(text) {
  accountCreditsEls.forEach((element) => {
    if (!element) return
    if (element.id === 'ws-credits') {
      element.textContent = `Credits：${text}`
      return
    }
    element.textContent = text
  })
}

function setAccountRefreshBtnState(loading) {
  const idleText = currentLang === 'en' ? 'Refresh' : '刷新'
  const loadingText = currentLang === 'en' ? 'Refreshing' : '刷新中'
  accountRefreshBtnEls.forEach((button) => {
    if (!button) return
    button.disabled = !!loading
    button.textContent = loading ? loadingText : idleText
  })
}

function openMindUserProfile() {
  const profileUrl = buildMindUserProfileUrl()
  const newTab = window.open(profileUrl, '_blank')
  if (newTab) {
    try {
      newTab.opener = null
    } catch {
      // ignore
    }
    return
  }
  Message.warning('浏览器拦截了新标签页，请允许弹窗后重试')
}

function handleLogout() {
  try {
    clearMindPlusLocalAuth()
    Message.success(currentLang === 'en' ? 'Logged out' : '已注销登录')
    const redirectPath = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/literature-assistant'
    window.location.href = buildMindUserLoginUrl(redirectPath, { logout: true })
  } catch (error) {
    console.error('logout failed:', error)
    Message.error(currentLang === 'en' ? 'Logout failed' : '注销失败')
  }
}

async function refreshAccountCredits() {
  if (accountRefreshing) return
  accountRefreshing = true
  setAccountRefreshBtnState(true)
  try {
    const token = resolveToken()
    if (!token) {
      renderAccountCreditsLabel('--')
      return
    }

    const baseUrl = getMindUserBaseUrl()
    const serviceKey = getMindUserServiceKey()
    const summaryUrl = new URL(`/api/${serviceKey}/wallet/summary`, `${baseUrl}/`).toString()
    const response = await fetch(summaryUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || Number(payload?.code) !== 200) {
      throw new Error(String(payload?.message || `请求失败 (${response.status})`))
    }

    const rawCredits = payload?.data?.credits
    const numericCredits = Number(rawCredits)
    const creditsText = Number.isFinite(numericCredits) ? String(numericCredits) : String(rawCredits || '--')
    renderAccountCreditsLabel(creditsText)
  } catch (error) {
    console.error('refresh account credits failed:', error)
    renderAccountCreditsLabel('--')
  } finally {
    accountRefreshing = false
    setAccountRefreshBtnState(false)
  }
}

function bindAccountPanel() {
  accountUsernameEls = Array.from(document.querySelectorAll('[data-account-username]'))
  accountCreditsEls = Array.from(document.querySelectorAll('[data-account-credits]'))
  accountRefreshBtnEls = Array.from(document.querySelectorAll('[data-account-refresh]'))
  accountRefreshHandlers = []

  renderLandingAccountTexts()
  renderAccountUsername()
  renderAccountCreditsLabel('--')

  accountRefreshBtnEls.forEach((button) => {
    const handler = () => {
      void refreshAccountCredits()
    }
    button.addEventListener('click', handler)
    accountRefreshHandlers.push({ button, handler })
  })

  if (!accountCreditsChangedHandler) {
    accountCreditsChangedHandler = () => {
      void refreshAccountCredits()
    }
  }
  window.addEventListener(CREDITS_CHANGED_EVENT, accountCreditsChangedHandler)

  if (!accountStorageHandler) {
    accountStorageHandler = (event) => {
      const changedKey = String(event?.key || '')
      if (!changedKey || changedKey === 'username' || changedKey === 'uid') {
        renderAccountUsername()
      }
      if (!changedKey || changedKey === 'jwt_token') {
        void refreshAccountCredits()
      }
    }
  }
  window.addEventListener('storage', accountStorageHandler)

  void refreshAccountCredits()
}

function unbindAccountPanel() {
  accountRefreshHandlers.forEach(({ button, handler }) => {
    if (!button || !handler) return
    button.removeEventListener('click', handler)
  })
  accountRefreshHandlers = []
  accountUsernameEls = []
  accountCreditsEls = []
  accountRefreshBtnEls = []

  if (accountCreditsChangedHandler) {
    window.removeEventListener(CREDITS_CHANGED_EVENT, accountCreditsChangedHandler)
  }
  if (accountStorageHandler) {
    window.removeEventListener('storage', accountStorageHandler)
  }
  accountCreditsChangedHandler = null
  accountStorageHandler = null
}

// ===== STATE =====
let currentJobId = null, eventSource = null, startTime = null, timerInterval = null;
let progressValue = 0, mdContent = '', currentPhase = null, reviewMode = null;
let pendingTopic = ''; // Topic entered on landing page
const seenMessages = new Set(); // Dedup for repeated messages
const LEAVE_PROGRESS_WARNING_TEXT = '若返回则进度丢失'
const TERMINAL_JOB_STATUS = new Set(['done', 'error', 'failed', 'cancelled'])
const FAILED_JOB_STATUS = new Set(['error', 'failed'])
const SSE_RECONNECT_BASE_DELAY_MS = 1500
const SSE_RECONNECT_MAX_DELAY_MS = 15000
const STATUS_SYNC_INTERVAL_MS = 8000
let currentJobStatus = 'idle'
let beforeUnloadHandler = null
let unloadHandler = null
let cancelJobPromise = null
let cancelJobTargetId = ''
let sseReconnectTimer = null
let sseReconnectAttempts = 0
let statusSyncTimer = null

function normalizeJobStatus(status) {
  return String(status || '').trim().toLowerCase()
}

function setJobStatus(status) {
  currentJobStatus = normalizeJobStatus(status) || 'idle'
}

function extractApiError(payload) {
  return String(payload?.error || payload?.message || payload?.detail || '').trim()
}

function setWorkspaceProcessingStatus() {
  const dot = document.getElementById('ws-dot')
  const text = document.getElementById('ws-status-text')
  if (dot) dot.className = 'status-dot'
  if (text) text.textContent = t('status_processing')
}

function setWorkspaceReviewStatus() {
  const dot = document.getElementById('ws-dot')
  const text = document.getElementById('ws-status-text')
  if (dot) dot.className = 'status-dot paused'
  if (text) text.textContent = t('status_review')
}

function clearSseReconnectTimer() {
  if (!sseReconnectTimer) return
  clearTimeout(sseReconnectTimer)
  sseReconnectTimer = null
}

function resetSseReconnectState() {
  sseReconnectAttempts = 0
  clearSseReconnectTimer()
}

function stopStatusSync() {
  if (!statusSyncTimer) return
  clearInterval(statusSyncTimer)
  statusSyncTimer = null
}

function closeEventStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  resetSseReconnectState()
}

function clearRealtimeTracking() {
  closeEventStream()
  stopStatusSync()
}

function isCurrentJobTerminal() {
  return TERMINAL_JOB_STATUS.has(normalizeJobStatus(currentJobStatus))
}

function shouldWarnProgressLoss() {
  const workspaceActive = Boolean(document.getElementById('workspace')?.classList.contains('active'))
  if (!workspaceActive) return false
  if (!currentJobId) return false
  return !isCurrentJobTerminal()
}

function confirmLeaveIfNeeded() {
  if (!shouldWarnProgressLoss()) return true
  return window.confirm(LEAVE_PROGRESS_WARNING_TEXT)
}

function isFailedJobStatus(status) {
  return FAILED_JOB_STATUS.has(normalizeJobStatus(status))
}

function isCancelledJobStatus(status) {
  return normalizeJobStatus(status) === 'cancelled'
}

function canOpenJobStatus(status) {
  return normalizeJobStatus(status) === 'done'
}

function collapseFailedPapers(papers) {
  if (!Array.isArray(papers)) return []
  const collapsed = []
  let failedShown = false
  for (const item of papers) {
    const status = normalizeJobStatus(item?.status)
    if (FAILED_JOB_STATUS.has(status)) {
      if (failedShown) continue
      failedShown = true
    }
    collapsed.push(item)
  }
  return collapsed
}

function getCurrentCancelableJobId() {
  const safeJobId = String(currentJobId || '').trim()
  if (!safeJobId) return ''
  if (isCurrentJobTerminal()) return ''
  return safeJobId
}

async function cancelCurrentJobIfRunning(reason = 'leave_page') {
  const safeJobId = getCurrentCancelableJobId()
  if (!safeJobId) return false
  if (cancelJobPromise && cancelJobTargetId === safeJobId) return cancelJobPromise

  cancelJobTargetId = safeJobId
  cancelJobPromise = (async () => {
    const payload = JSON.stringify({ reason: String(reason || 'leave_page') })
    try {
      await fetch(apiUrl(`/cancel/${encodeURIComponent(safeJobId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      })
    } catch (error) {
      console.warn('cancel opendraft job failed:', error)
    }

    setJobStatus('cancelled')
    localStorage.removeItem('opendraft_job')
    return true
  })()

  try {
    return await cancelJobPromise
  } finally {
    cancelJobPromise = null
    cancelJobTargetId = ''
  }
}

function sendCancelJobBeacon(reason = 'leave_page') {
  const safeJobId = getCurrentCancelableJobId()
  if (!safeJobId) return false
  const payload = JSON.stringify({ reason: String(reason || 'leave_page') })
  const targetUrl = apiUrl(`/cancel/${encodeURIComponent(safeJobId)}`)

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      const queued = navigator.sendBeacon(targetUrl, blob)
      if (queued) {
        setJobStatus('cancelled')
        localStorage.removeItem('opendraft_job')
        return true
      }
    }
  } catch (error) {
    console.warn('cancel opendraft job beacon failed:', error)
  }

  try {
    void fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  } catch {}
  setJobStatus('cancelled')
  localStorage.removeItem('opendraft_job')
  return true
}

const PHASE_ICONS = { init:'&#9881;', research:'&#128269;', outline:'&#128221;', writing:'&#9999;', compile:'&#128295;', export:'&#128230;', done:'&#10003;' };
const MILESTONES = [
  {key:'Loading AI model',pct:3},{key:'Starting academic research',pct:8},{key:'Research summaries complete',pct:22},
  {key:'All research papers organized',pct:28},{key:'Research gaps identified',pct:34},{key:'Designing thesis structure',pct:40},
  {key:'Outline created',pct:46},{key:'Starting chapter composition',pct:50},{key:'Introduction complete',pct:57},
  {key:'Literature Review complete',pct:62},{key:'Methodology complete',pct:66},{key:'Analysis & Results complete',pct:70},
  {key:'Discussion complete',pct:74},{key:'Conclusion complete',pct:80},{key:'Starting document compilation',pct:85},
  {key:'Abstract generated',pct:90},{key:'Starting document export',pct:93},{key:'Generation complete',pct:98},
];
const MSG_PHASE_MAP = [
  {key:'Generation started',p:'init'},{key:'Loading AI model',p:'init'},{key:'AI model ready',p:'init'},
  {key:'Starting academic research',p:'research'},{key:'Querying',p:'research'},{key:'Found:',p:'research'},
  {key:'more sources',p:'research'},{key:'Summarizing research',p:'research'},{key:'Research summaries complete',p:'research'},
  {key:'Organizing research',p:'research'},{key:'All research papers organized',p:'research'},
  {key:'Analyzing research gaps',p:'research'},{key:'Research gaps identified',p:'research'},
  {key:'Preparing thesis structure',p:'outline'},{key:'Designing thesis structure',p:'outline'},{key:'Creating thesis outline',p:'outline'},
  {key:'Using approved outline',p:'outline'},{key:'Outline created',p:'outline'},{key:'Outline ready',p:'outline'},
  {key:'Processing citations',p:'outline'},{key:'citations ready',p:'outline'},
  {key:'Starting paper writing',p:'writing'},{key:'Starting chapter composition',p:'writing'},{key:'Writing',p:'writing'},
  {key:'Introduction complete',p:'writing'},{key:'Literature Review complete',p:'writing'},
  {key:'Methodology complete',p:'writing'},{key:'Analysis & Results complete',p:'writing'},
  {key:'Discussion complete',p:'writing'},{key:'Merging sections',p:'writing'},{key:'Conclusion complete',p:'writing'},
  {key:'ready for review',p:'writing'},
  {key:'Starting document compilation',p:'compile'},{key:'Compiling citations',p:'compile'},
  {key:'Citations compiled',p:'compile'},{key:'Generating abstract',p:'compile'},{key:'Abstract generated',p:'compile'},
  {key:'Starting document export',p:'export'},{key:'Generating PDF',p:'export'},{key:'PDF',p:'export'},
  {key:'Creating Word',p:'export'},{key:'Word document ready',p:'export'},{key:'ZIP bundle',p:'export'},
  {key:'Generation complete',p:'done'},
];
function detectPhase(msg) { for(const m of MSG_PHASE_MAP) if(msg.includes(m.key)) return m.p; return currentPhase||'init'; }
function isMilestone(msg) {
  const raw = String(msg || '');
  const lower = raw.toLowerCase();
  const enHit = ['complete','ready','created','identified','organized','generated','compiled']
    .some(k => lower.includes(k));
  if (enHit) return true;
  return /(完成|就绪|已准备|已创建|已生成|已识别|已整理|已编译|等待审阅|可审阅)/.test(raw);
}

// Messages that should show a counter instead of repeating
const COUNTER_KEYS = [
  'Querying Crossref, Semantic Scholar & AI search in parallel',
  '正在并行查询学术数据库',
  'Querying Crossref for peer-reviewed papers',
  'AI-powered academic search',
];
const counterState = {}; // key -> { count, elementId }
function shouldDedup(msg) {
  for (const key of COUNTER_KEYS) {
    if (msg.includes(key)) {
      if (!counterState[key]) {
        // First time: allow through, will be rendered normally
        counterState[key] = { count: 1, elementId: 'counter-' + Date.now() };
        return false; // Let it render
      }
      // Subsequent times: update counter on existing element
      counterState[key].count++;
      const el = document.getElementById(counterState[key].elementId);
      if (el) {
        const label = currentLang === 'zh' ? '正在并行查询学术数据库...' : 'Querying academic databases...';
        el.textContent = `${label} (${counterState[key].count})`;
      }
      return true; // Skip adding new item
    }
  }
  return false;
}

// ===== NAVIGATION =====
function hideAllPages() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('workspace').classList.remove('active');
  document.getElementById('my-papers').classList.remove('active');
}
function showLanding() {
  hideAllPages();
  document.getElementById('landing').classList.remove('hidden');
}
function backToLanding() {
  showLanding();
}

// ===== MY PAPERS PAGE =====
async function showMyPapers() {
  const workspaceActive = Boolean(document.getElementById('workspace')?.classList.contains('active'))
  if (workspaceActive && !confirmLeaveIfNeeded()) return
  if (workspaceActive) {
    await cancelCurrentJobIfRunning('switch_to_history')
    clearRealtimeTracking()
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
  hideAllPages();
  document.getElementById('my-papers').classList.add('active');
  applyI18n();
  try {
    const res = await fetch(apiUrl('/papers'));
    const papers = collapseFailedPapers(await res.json());
    renderPapersList(papers);
  } catch(e) {
    document.getElementById('papers-grid').innerHTML = `<div class="papers-empty">${t('papers_empty')}</div>`;
  }
}
function renderPapersList(papers) {
  const grid = document.getElementById('papers-grid');
  if (!papers || papers.length === 0) {
    grid.innerHTML = `<div class="papers-empty">${t('papers_empty')}</div>`;
    return;
  }
  grid.innerHTML = papers.map(p => {
    const safeStatus = normalizeJobStatus(p.status)
    const isDone = safeStatus === 'done'
    const isFailed = isFailedJobStatus(safeStatus)
    const isCancelled = isCancelledJobStatus(safeStatus)
    const statusKey = isDone ? 'done' : (isFailed ? 'error' : (isCancelled ? 'cancelled' : 'running'))
    const statusCls = statusKey
    const statusText = t('paper_status_' + statusKey);
    const date = new Date((p.created_at || 0) * 1000);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const clickable = canOpenJobStatus(safeStatus)
    const clickAttr = clickable
      ? `onclick="openPaper('${p.job_id}','${encodeURIComponent(p.topic)}','${safeStatus}')"`
      : ''
    const disabledClass = clickable ? '' : 'disabled'
    return `<div class="paper-card ${disabledClass}" ${clickAttr}>
      <div class="paper-status-dot ${statusCls}"></div>
      <div class="paper-info">
        <div class="paper-topic">${p.topic || 'Untitled'}</div>
        <div class="paper-meta">${statusText} &middot; ${t('paper_created')} ${dateStr}</div>
      </div>
      <button class="paper-delete" onclick="event.stopPropagation();deletePaper('${p.job_id}')" title="Delete">&times;</button>
    </div>`;
  }).join('');
}
async function deletePaper(jobId) {
  try {
    await fetch(apiUrl(`/papers/${encodeURIComponent(jobId)}`), { method: 'DELETE' });
    showMyPapers();
  } catch(e) {}
}
function openPaper(jobId, encodedTopic, status) {
  const topic = decodeURIComponent(encodedTopic);
  const safeStatus = normalizeJobStatus(status);
  if (!canOpenJobStatus(safeStatus)) return false
  // Open completed paper in workspace
  currentJobId = jobId;
  setJobStatus(safeStatus)
  showWorkspace(topic, true);
  // Try to load content
  loadPaperContent();
  updateProgress(100);
  finalizeAllPhases();
  document.getElementById('ws-dot').classList.add('done');
  document.getElementById('ws-status-text').textContent = t('status_complete');
  document.getElementById('download-bar').classList.add('show');
  return true
}
function newPaper() {
  showLanding();
  document.getElementById('topic-input').value = '';
  document.getElementById('topic-input').focus();
}

// ===== STEP 1: START WRITING (from landing) =====
function startWriting() {
  const topic = document.getElementById('topic-input').value.trim();
  if (!topic) { document.getElementById('topic-input').focus(); return; }
  pendingTopic = topic;
  // Jump to workspace, show settings form in left panel
  showWorkspace(topic, false);
  showSettingsForm();
}

function showSettingsForm() {
  document.getElementById('settings-form-panel').style.display = 'block';
  document.getElementById('activity-container').style.display = 'none';
  document.getElementById('ws-dot').className = 'status-dot settings';
  document.getElementById('ws-status-text').textContent = t('status_settings');
  document.getElementById('preview-area').innerHTML = `<div class="placeholder"><div class="placeholder-icon">&#9997;</div><div>${t('placeholder_wait')}</div></div>`;
}

// ===== STEP 2: CONFIRM SETTINGS & START =====
async function confirmSettingsAndStart() {
  const btn = document.getElementById('btn-confirm-settings');
  btn.disabled = true; btn.textContent = t('confirming_btn');

  // Gather params
  const params = getParams();

  // Hide settings, show activity
  document.getElementById('settings-form-panel').style.display = 'none';
  document.getElementById('activity-container').style.display = 'block';
  document.getElementById('ws-dot').className = 'status-dot';
  document.getElementById('ws-status-text').textContent = t('status_processing');
  document.getElementById('preview-area').innerHTML = `<div class="placeholder"><div class="placeholder-icon">&#9997;</div><div>${t('placeholder_generating')}</div></div>`;

  startTime = Date.now(); progressValue = 0; updateProgress(0); startTimer();
  seenMessages.clear();

  // Show AI thinking steps progressively in left panel workflow
  const thinkingSteps = [
    { key: 'thinking_outline_start', delay: 0 },
    { key: 'thinking_analyzing', delay: 800 },
    { key: 'thinking_reviewing_topic', delay: 2500 },
    { key: 'thinking_designing_chapters', delay: 5000 },
    { key: 'thinking_detailing_sections', delay: 9000 },
  ];

  // Create an "outline" phase group for the thinking steps
  const outlinePhase = ensurePhaseGroup('outline');

  // Schedule thinking steps to appear progressively
  const thinkingTimers = [];
  for (const step of thinkingSteps) {
    const timer = setTimeout(() => {
      showAiThinking(t(step.key));
    }, step.delay);
    thinkingTimers.push(timer);
  }

  // Generate outline via API
  try {
    const outlineRes = await fetch(apiUrl('/outline'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(params) });
    const outlineData = await outlineRes.json().catch(() => ({}));

    // Clear any pending thinking timers
    thinkingTimers.forEach(t => clearTimeout(t));
    removeAiThinking();

    const outlineErr = extractApiError(outlineData)
    if (!outlineRes.ok || outlineErr || Number(outlineData?.code) >= 400) {
      addActivity('ERROR: ' + (outlineErr || `请求失败 (${outlineRes.status})`));
      btn.disabled = false; btn.textContent = t('confirm_start_btn');
      return;
    }

    // Show useful AI thinking summaries in left panel (filter out raw English meta-text)
    if (outlineData.thinking) {
      const seen = new Set();
      const lines = outlineData.thinking.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const clean = line.replace(/^[-*•]\s*/, '').trim();
        if (!clean) continue;
        // Skip raw English meta/planning text
        if (/^(okay|alright|let me|here'?s|my |so |now |i('m| need| will| want| should| have| see| imagine)|the (task|goal|instructions|structure)|it'?s? (got|a |all|written))/i.test(clean)) continue;
        if (/^(\*\*my |\*\*chapter|planning|crafting|refining)/i.test(clean)) continue;
        // Deduplicate
        if (seen.has(clean)) continue;
        seen.add(clean);
        addActivity(clean);
      }
    }

    // Show completion in left panel
    addActivity(t('thinking_outline_done'));

    // Show outline in right panel for review
    showOutlineReview(outlineData.outline);
  } catch(e) {
    thinkingTimers.forEach(t => clearTimeout(t));
    removeAiThinking();
    addActivity('ERROR: ' + e.message);
    btn.disabled = false; btn.textContent = t('confirm_start_btn');
  }
}

function getParams() {
  const formats = []; document.querySelectorAll('.fmt-check:checked').forEach(cb=>formats.push(cb.value));
  return {
    topic: pendingTopic,
    language: document.getElementById('sf-lang').value,
    level: document.getElementById('sf-level').value,
    target_words: document.getElementById('sf-words').value || null,
    target_citations: document.getElementById('sf-citations').value || null,
    author_name: document.getElementById('sf-author').value || null,
    institution: document.getElementById('sf-institution').value || null,
    department: document.getElementById('sf-department').value || null,
    faculty: document.getElementById('sf-faculty').value || null,
    advisor: document.getElementById('sf-advisor').value || null,
    second_examiner: document.getElementById('sf-examiner').value || null,
    location: document.getElementById('sf-location').value || null,
    student_id: document.getElementById('sf-studentid').value || null,
    blurb: document.getElementById('sf-blurb').value || null,
    formats: formats.length ? formats : ['docx', 'md'],
  };
}

function showOutlineReview(outline) {
  setJobStatus('outline_review')
  reviewMode = 'outline';
  currentSectionName = 'outline';
  addSectionCard('outline');
  const safeOutline = typeof outline === 'string' ? outline : ''
  document.getElementById('md-editor').value = safeOutline;
  renderPreview(safeOutline);
  switchRightTab('editor');
  document.getElementById('btn-save').disabled = false;
  showApprovalCard(`<strong>${t('outline_review_msg')}</strong>`, t('approve_outline'));
  setWorkspaceReviewStatus()
}

function showChapterReview(payload = {}) {
  setJobStatus('chapter_review')
  reviewMode = 'chapter'
  const sectionKey = String(payload?.chapter || payload?.review_chapter || 'chapter')
  const chapterDisplayName = String(payload?.chapter_name || payload?.review_chapter_name || sectionKey)
  currentSectionName = sectionKey
  addSectionCard(sectionKey, chapterDisplayName)
  const content = String(payload?.content || payload?.review_content || '')
  if (content) {
    document.getElementById('md-editor').value = content
    renderPreview(content)
  }
  switchRightTab('preview')
  document.getElementById('btn-save').disabled = false
  showApprovalCard(`<strong>${t('chapter_review_msg')} ${chapterDisplayName}</strong>`, t('approve_chapter'))
  setWorkspaceReviewStatus()
}

// ===== AI THINKING DISPLAY (in left panel workflow) =====
function showAiThinking(text) {
  // Convert previous thinking bubble into a completed activity item
  const existing = document.getElementById('ai-thinking-bubble');
  if (existing) {
    const prevText = existing.querySelector('.ai-thinking-text')?.textContent || '';
    existing.remove();
    // Add previous step as a completed activity item in the outline phase
    const g = document.getElementById('activity-container').querySelector('.phase-group[data-phase="outline"]');
    if (g) {
      const a = g.querySelector('.phase-activities');
      const item = document.createElement('div');
      item.className = 'activity-item';
      const now = new Date();
      const ts = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
      item.innerHTML = `<div class="activity-bullet highlight"></div><div class="activity-text">${prevText}</div><div class="activity-time">${ts}</div>`;
      a.appendChild(item);
    }
  }
  // Show new thinking bubble
  const container = document.getElementById('activity-container');
  const div = document.createElement('div');
  div.className = 'ai-thinking';
  div.id = 'ai-thinking-bubble';
  div.innerHTML = `<div class="ai-thinking-label">${t('ai_thinking')}</div><div class="ai-thinking-text">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
function removeAiThinking() {
  const el = document.getElementById('ai-thinking-bubble');
  if (el) el.remove();
}

// ===== APPROVAL CARD (floating in activity log) =====
function showApprovalCard(infoHtml, btnText) {
  hideApprovalCard();
  const container = document.getElementById('activity-container');
  const card = document.createElement('div');
  card.className = 'approval-card show';
  card.id = 'approval-card';
  card.innerHTML = `<div class="info">${infoHtml}</div><button class="btn-approve" onclick="approveAndContinue()">${btnText}</button>`;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}
function hideApprovalCard() {
  const el = document.getElementById('approval-card');
  if (el) el.remove();
}

// ===== STEP 3: APPROVE & START WRITING =====
async function approveAndContinue() {
  hideApprovalCard();
  setWorkspaceProcessingStatus()

  if (reviewMode === 'outline') {
    reviewMode = null;
    const outline = document.getElementById('md-editor').value;
    const params = getParams();
    params.outline = outline;
    switchRightTab('preview');
    document.getElementById('preview-area').innerHTML = `<div class="placeholder"><div class="placeholder-icon">&#9997;</div><div>${t('placeholder_generating')}</div></div>`;
    startTime = Date.now(); progressValue = 0; updateProgress(0); startTimer();
    addActivity(currentLang==='zh'?'✅ 大纲已确认，开始研究和写作':'✅ Outline approved. Starting research and writing.');

    try {
      const res = await fetch(apiUrl('/generate'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(params) });
      const data = await res.json().catch(() => ({}));
      const generateErr = extractApiError(data)
      if (!res.ok || generateErr || Number(data?.code) >= 400) {
        reviewMode = 'outline'
        showApprovalCard(`<strong>${t('outline_review_msg')}</strong>`, t('approve_outline'))
        setWorkspaceReviewStatus()
        addActivity('ERROR: ' + (generateErr || `请求失败 (${res.status})`));
        return;
      }
      currentJobId = String(data?.job_id || data?.jobId || data?.data?.job_id || '').trim();
      if (!currentJobId) {
        reviewMode = 'outline'
        showApprovalCard(`<strong>${t('outline_review_msg')}</strong>`, t('approve_outline'))
        setWorkspaceReviewStatus()
        addActivity('ERROR: 未返回 job_id，无法继续生成');
        return
      }
      setJobStatus('running')
      localStorage.setItem('opendraft_job', JSON.stringify({ job_id:currentJobId, topic:params.topic, start_time:Date.now() }));
      connectSSE();
    } catch(e) {
      reviewMode = 'outline'
      showApprovalCard(`<strong>${t('outline_review_msg')}</strong>`, t('approve_outline'))
      setWorkspaceReviewStatus()
      addActivity('ERROR: ' + e.message);
    }
  } else if (reviewMode === 'chapter') {
    reviewMode = null;
    addActivity(currentLang==='zh'?'✅ 章节已确认，继续下一步':'✅ Chapter approved. Continuing.');
    try {
      const res = await fetch(apiUrl(`/approve/${encodeURIComponent(currentJobId)}`), {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      const approveErr = extractApiError(data)
      if (!res.ok || approveErr || Number(data?.code) >= 400) {
        reviewMode = 'chapter'
        showApprovalCard(`<strong>${t('chapter_review_msg')} ${currentSectionName || ''}</strong>`, t('approve_chapter'))
        setWorkspaceReviewStatus()
        addActivity('ERROR: ' + (approveErr || `请求失败 (${res.status})`))
        return
      }
      setJobStatus('running')
      setWorkspaceProcessingStatus()
      if (!eventSource) {
        connectSSE()
      }
    } catch(e) {
      reviewMode = 'chapter'
      showApprovalCard(`<strong>${t('chapter_review_msg')} ${currentSectionName || ''}</strong>`, t('approve_chapter'))
      setWorkspaceReviewStatus()
      addActivity('ERROR: ' + e.message)
    }
  }
}

// ===== WORKSPACE =====
function showWorkspace(topic, skipSettings) {
  clearRealtimeTracking()
  hideAllPages();
  document.getElementById('workspace').classList.add('active');
  document.getElementById('ws-title').textContent = topic || t('ws_generating');
  startTime = null; progressValue = 0; currentPhase = null;
  reviewMode = null;
  currentSectionName = '';
  completedSections = {};
  if (!skipSettings) setJobStatus('settings');
  seenMessages.clear(); Object.keys(counterState).forEach(k => delete counterState[k]);
  document.getElementById('activity-container').innerHTML = '';
  document.getElementById('activity-container').style.display = skipSettings ? 'block' : 'none';
  document.getElementById('download-bar').classList.remove('show');
  const sectionsPanel = document.getElementById('sections-panel');
  const sectionsGrid = document.getElementById('sections-grid');
  const sectionsToggleBtn = document.getElementById('sections-toggle-btn');
  if (sectionsPanel) sectionsPanel.classList.remove('visible');
  if (sectionsGrid) {
    sectionsGrid.innerHTML = '';
    sectionsGrid.classList.remove('collapsed');
  }
  if (sectionsToggleBtn) sectionsToggleBtn.textContent = '▲';
  hideApprovalCard();
  document.getElementById('btn-save').disabled = true;
  document.getElementById('ws-dot').className = 'status-dot';
  document.getElementById('ws-status-text').textContent = t('status_processing');
  updateProgress(0);
  applyI18n();

  if (skipSettings) {
    document.getElementById('settings-form-panel').style.display = 'none';
  }
}

async function goBack() {
  if (!confirmLeaveIfNeeded()) return
  await cancelCurrentJobIfRunning('go_back')
  clearRealtimeTracking()
  if (timerInterval) { clearInterval(timerInterval); timerInterval=null; }
  currentJobId = null;
  setJobStatus('idle');
  reviewMode = null;
  showLanding();
  document.getElementById('btn-go').disabled = false;
  document.getElementById('btn-go').textContent = t('start_btn');
  document.getElementById('btn-confirm-settings').disabled = false;
  document.getElementById('btn-confirm-settings').textContent = t('confirm_start_btn');
}
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now()-startTime)/1000);
    const m=Math.floor(elapsed/60), s=elapsed%60;
    let txt=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (progressValue>5 && progressValue<98) { const eta=Math.round(elapsed/progressValue*(100-progressValue)); txt+=` / ~${Math.floor(eta/60)}m${String(eta%60).padStart(2,'0')}s`; }
    document.getElementById('ws-time').textContent = txt;
  }, 1000);
}
function updateProgress(pct) { progressValue=pct; document.getElementById('ws-progress').style.width=pct+'%'; }
function advanceProgress(msg) { for(const m of MILESTONES) if(msg.includes(m.key)&&m.pct>progressValue){updateProgress(m.pct);break;} }

// ===== LEFT PANEL (Activity only, no logs tab) =====
function ensurePhaseGroup(phase) {
  const c = document.getElementById('activity-container');
  let g = c.querySelector(`.phase-group[data-phase="${phase}"]`);
  if (g) { if(currentPhase&&currentPhase!==phase){ const p=c.querySelector(`.phase-group[data-phase="${currentPhase}"]`); if(p){const s=p.querySelector('.phase-spinner');if(s)s.outerHTML='<span class="phase-check">&#10003;</span>';} } currentPhase=phase; return g; }
  if (currentPhase) { const p=c.querySelector(`.phase-group[data-phase="${currentPhase}"]`); if(p){const s=p.querySelector('.phase-spinner');if(s)s.outerHTML='<span class="phase-check">&#10003;</span>';} }
  currentPhase=phase; g=document.createElement('div'); g.className='phase-group'; g.setAttribute('data-phase',phase);
  g.innerHTML=`<div class="phase-header"><div class="phase-icon ${phase}">${PHASE_ICONS[phase]||'&#9679;'}</div><span class="phase-header-label" data-phase="${phase}">${t('phase_'+phase)}</span>${phase==='done'?'<span class="phase-check">&#10003;</span>':'<div class="phase-spinner"></div>'}</div><div class="phase-activities"></div>`;
  c.appendChild(g); c.scrollTop=c.scrollHeight; return g;
}
function isThinkingNoise(msg) {
  const s = msg.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}✅❌⚠️🔍🔗🏗️✍️📝📋📄📚📑📦🎉🚀🤖🔧📖]+\s*/u, '').trim();
  if (!s) return true;
  // Pattern 1: Starts with AI self-talk keywords
  if (/^(\*\*my |my (approach|research|ai|mental|immediate|summary)|okay[, ]|alright[, ]|let me |here'?s (what|how|the)|so[, ] (the |i |let)|now[, ] let|i('m| need to| will| want| should| have to| see | imagine)|the (task|goal|instructions|structure|whole)|it'?s? (got|a |all|written)|finally[, ] i)/i.test(s)) return true;
  // Pattern 2: AI meta-commentary headers and phrases
  if (/^(\*{0,2}chapter|\*{0,2}my\s+summary|\*{0,2}my|planning process|crafting the|refining chapter|for the research|summary of (the |my )?ai)/i.test(s)) return true;
  // Pattern 3: Sentences describing what "the AI" does (meta-narrative)
  if (/\b(the ai|the model)\b.*(understand|recogniz|grasp|proceed|extract|comprehend|acknowledg|synthesiz|identif|analyz|rephras)/i.test(s)) return true;
  // Pattern 4: Sequential meta-narration (First/Then/Next/Finally + AI process description)
  if (/^(first|then|next|finally|after that|subsequently|at this point)[, ]/i.test(s) && /\b(ai|it |the model|the system|reasoning|synthesiz|extract|summar|translat|rephras|output|constrain)/i.test(s)) return true;
  // Pattern 5: Long English-only messages (>60 chars, >90% ASCII, no Chinese) — likely AI meta-text
  if (s.length > 60) {
    const nonAscii = s.replace(/[\x00-\x7F]/g, '').length;
    if (nonAscii === 0 && !/^(✅|❌|⚠️|📚|🔍|✍️)/.test(msg.trim())) {
      // Pure English long text — check if it's AI process description
      if (/\b(understand|recogniz|proceed|extract|comprehend|synthesiz|acknowledg|constrain|rephras|bullet point|core (task|subject)|key (point|theme)|research (paper|method)|provided (text|outline|material))\b/i.test(s)) return true;
    }
  }
  return false;
}
function addActivity(msg) {
  // Filter out AI thinking noise (English meta-text)
  if (isThinkingNoise(msg)) return;
  // Counter/dedup check
  if (shouldDedup(msg)) return;

  // Check if this is a counter message (first occurrence) — assign element id
  let counterId = null;
  for (const key of COUNTER_KEYS) {
    if (msg.includes(key) && counterState[key]) {
      counterId = counterState[key].elementId;
      break;
    }
  }

  // Handle expandable sources group (||EXPAND|| marker)
  const expandMatch = msg.match(/^(.+?)\|\|EXPAND\|\|(.+)$/);
  if (expandMatch) {
    const phase=detectPhase(msg); const g=ensurePhaseGroup(phase); const a=g.querySelector('.phase-activities');
    const now=new Date(); const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
    const label = translateMsg(expandMatch[1].trim());
    let sources = [];
    try { sources = JSON.parse(expandMatch[2]); } catch(e) {}
    const item=document.createElement('div'); item.className='activity-item expandable-sources';
    const uid = 'exp_' + Date.now();
    item.innerHTML=`<div class="activity-bullet found"></div><div class="activity-text"><span class="expand-toggle" id="${uid}_btn" onclick="toggleExpand('${uid}')">${label} <span class="expand-arrow">&#9654;</span></span><div class="expand-list" id="${uid}" style="display:none">${sources.map(s=>{const t=s.title+(s.ref?' — '+s.ref:'');return s.url?`<a class="source-link" href="${s.url}" target="_blank" rel="noopener">${t}</a>`:`<span>${t}</span>`;}).join('')}</div></div><div class="activity-time">${ts}</div>`;
    a.appendChild(item); document.getElementById('activity-container').scrollTop=document.getElementById('activity-container').scrollHeight;
    return;
  }

  const phase=detectPhase(msg); const g=ensurePhaseGroup(phase); const a=g.querySelector('.phase-activities');
  const item=document.createElement('div'); item.className='activity-item';
  const now=new Date(); const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  const isC=isMilestone(msg), isF=msg.includes('Found:')||msg.includes('发现');
  const isRefining=msg.includes('🔄')||msg.includes('正在润色');
  const isRefined=msg.includes('✨')||msg.includes('润色完成');
  let translated=translateMsg(msg);

  // Parse source link from ||url|| marker
  let linkUrl = '';
  const linkMatch = msg.match(/\|\|(.+?)\|\|/);
  if (linkMatch) {
    linkUrl = linkMatch[1];
    translated = translated.replace(/\|\|.+?\|\|/, '');
  }

  const textId = counterId ? ` id="${counterId}"` : '';
  let textHtml = translated + (counterId ? ' (1)' : '');

  // Make found papers clickable
  if (isF && linkUrl) {
    textHtml = `<a class="source-link" href="${linkUrl}" target="_blank" rel="noopener">${translated}</a>`;
  }

  const bulletClass=isC?'highlight':isRefining?'refining':isRefined?'refined':isF?'found':'';
  item.innerHTML=`<div class="activity-bullet ${bulletClass}"></div><div class="activity-text"${textId} data-raw="${msg.replace(/"/g,'&quot;')}">${textHtml}</div><div class="activity-time">${ts}</div>`;

  // Add section card only for outline milestone (chapter cards are added by chapter_review SSE)
  if (isC && currentJobId) {
    if (msg.includes('Outline created') || msg.includes('大纲创建') || msg.includes('Outline ready') || msg.includes('大纲已准备')) {
      addSectionCard('outline', currentLang === 'zh' ? '大纲' : 'Outline');
    }
  }

  a.appendChild(item); document.getElementById('activity-container').scrollTop=document.getElementById('activity-container').scrollHeight;
  document.getElementById('ws-status-text').textContent=translated.replace(/^[^\w\u4e00-\u9fff]*/,'').replace(/<[^>]+>/g,'').substring(0,30);
}
function toggleExpand(uid) {
  const list = document.getElementById(uid);
  const arrow = document.querySelector(`#${uid}_btn .expand-arrow`);
  if (list.style.display === 'none') {
    list.style.display = 'flex';
    if (arrow) arrow.classList.add('open');
  } else {
    list.style.display = 'none';
    if (arrow) arrow.classList.remove('open');
  }
}
function finalizeAllPhases() { document.querySelectorAll('.phase-spinner').forEach(s=>s.outerHTML='<span class="phase-check">&#10003;</span>'); }

// ===== RIGHT PANEL =====
function switchRightTab(tab) {
  const isP=tab==='preview';
  document.getElementById('preview-area').style.display=isP?'block':'none';
  document.getElementById('editor-area').style.display=isP?'none':'block';
  document.getElementById('tab-preview').classList.toggle('active',isP);
  document.getElementById('tab-editor').classList.toggle('active',!isP);
}
async function loadPaperContent() {
  if(!currentJobId) return;
  try { const r=await fetch(apiUrl(`/md/${encodeURIComponent(currentJobId)}`)); if(!r.ok)return; const d=await r.json().catch(() => ({})); if(!d.content)return; mdContent=d.content; renderPreview(mdContent); document.getElementById('md-editor').value=mdContent; document.getElementById('btn-save').disabled=false; } catch(e){console.error(e);}
}
function renderPreview(md) {
  let h = md;
  // Strip YAML frontmatter
  h = h.replace(/^---\n[\s\S]*?\n---\n/, '');

  // Parse markdown tables first (before other processing)
  h = h.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm, function(match, headerRow, sepRow, bodyRows) {
    const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());
    const headers = parseRow(headerRow);
    // Detect alignment from separator row
    const aligns = parseRow(sepRow).map(s => {
      if (/^:-+:$/.test(s)) return 'center';
      if (/^-+:$/.test(s)) return 'right';
      return 'left';
    });
    let html = '<table><thead><tr>';
    headers.forEach((h, i) => { html += `<th style="text-align:${aligns[i]||'left'}">${h}</th>`; });
    html += '</tr></thead><tbody>';
    bodyRows.trim().split('\n').forEach(row => {
      const cells = parseRow(row);
      html += '<tr>';
      cells.forEach((c, i) => { html += `<td style="text-align:${aligns[i]||'left'}">${c}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  });

  // Headings
  h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Inline formatting
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks and inline code
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Lists
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // Paragraphs
  const lines = h.split('\n'), result = [];
  let inP = false;
  for (const line of lines) {
    const tr = line.trim();
    if (!tr) { if (inP) { result.push('</p>'); inP = false; } continue; }
    if (tr.startsWith('<h') || tr.startsWith('<pre') || tr.startsWith('<blockquote') ||
        tr.startsWith('<li') || tr.startsWith('</') || tr.startsWith('<table') ||
        tr.startsWith('<thead') || tr.startsWith('<tbody') || tr.startsWith('<tr') ||
        tr.startsWith('<th') || tr.startsWith('<td')) {
      if (inP) { result.push('</p>'); inP = false; }
      result.push(line);
    } else {
      if (!inP) { result.push('<p>'); inP = true; }
      result.push(line);
    }
  }
  if (inP) result.push('</p>');
  document.getElementById('preview-area').innerHTML = '<div class="paper-content">' + result.join('\n') + '</div>';
}
async function saveEdits() {
  if(reviewMode==='outline') { renderPreview(document.getElementById('md-editor').value); const btn=document.getElementById('btn-save'); btn.textContent=t('btn_saved'); setTimeout(()=>btn.textContent=t('btn_save'),1500); return; }
  if(!currentJobId) return;
  const content=document.getElementById('md-editor').value;
  try{const r=await fetch(apiUrl(`/save/${encodeURIComponent(currentJobId)}`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})}); const d=await r.json(); if(d.ok){mdContent=content;renderPreview(content);const b=document.getElementById('btn-save');b.textContent=t('btn_saved');setTimeout(()=>b.textContent=t('btn_save'),1500);}}catch(e){alert('Save failed: '+e.message);}
}
function downloadFile(fmt) {
  if (!currentJobId || (fmt !== 'docx' && fmt !== 'md')) return
  window.open(apiUrl(`/download/${encodeURIComponent(currentJobId)}/${encodeURIComponent(fmt)}`),'_blank')
}

let currentSectionName = '';

// ===== SECTION CARDS =====
let completedSections = {};
const SECTION_ICONS = { outline:'📋', introduction:'📝', literature_review:'📚', methodology:'🔬', analysis_results:'📊', discussion:'💬', conclusion:'📌', main_body:'📄', appendices:'📎' };

function addSectionCard(sectionKey, displayName) {
  if (completedSections[sectionKey]) return; // already added
  completedSections[sectionKey] = true;
  const panel = document.getElementById('sections-panel');
  panel.classList.add('visible');
  const grid = document.getElementById('sections-grid');
  const card = document.createElement('div');
  card.className = 'section-card';
  card.setAttribute('data-section', sectionKey);
  // Use displayName if provided, else try translation, else use key
  const label = displayName || t('sec_'+sectionKey) || sectionKey;
  const icon = sectionKey === 'outline' ? '📋' : '📄';
  card.innerHTML = `<span class="sc-icon">${icon}</span><span>${label}</span><span class="sc-dot"></span>`;
  card.onclick = () => {
    grid.querySelectorAll('.section-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    loadSection(sectionKey);
  };
  grid.appendChild(card);
}

function toggleSectionsPanel() {
  const grid = document.getElementById('sections-grid');
  const btn = document.getElementById('sections-toggle-btn');
  grid.classList.toggle('collapsed');
  btn.textContent = grid.classList.contains('collapsed') ? '▼' : '▲';
}

async function loadSection(sectionName) {
  if (!currentJobId) return;
  currentSectionName = sectionName;
  // Highlight active card
  document.querySelectorAll('.section-card').forEach(c => c.classList.toggle('active', c.getAttribute('data-section')===sectionName));
  try {
    const res = await fetch(apiUrl(`/sections/${encodeURIComponent(currentJobId)}/${encodeURIComponent(sectionName)}`));
    if (!res.ok) return;
    const data = await res.json();
    if (data.content) {
      document.getElementById('md-editor').value = data.content;
      renderPreview(data.content);
      document.getElementById('btn-save').disabled = false;
      switchRightTab('preview');
    }
  } catch(e) { console.error(e); }
}

function setDownloadButtonsVisibility(data = {}) {
  const mdBtn = document.getElementById('dl-md')
  const docxBtn = document.getElementById('dl-docx')
  if (mdBtn) mdBtn.style.display = data.md ? '' : 'none'
  if (docxBtn) docxBtn.style.display = data.docx ? '' : 'none'
}

function handleTerminalStatus(data = {}) {
  const status = normalizeJobStatus(data?.status)
  if (!status) return

  setJobStatus(status)
  finalizeAllPhases()

  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  if (status === 'done') {
    updateProgress(100)
    document.getElementById('ws-dot').className = 'status-dot done'
    document.getElementById('ws-status-text').textContent = t('status_complete')
    const dl = document.getElementById('download-bar')
    dl.classList.add('show')
    setDownloadButtonsVisibility(data)
    loadPaperContent()
  } else if (status === 'error' || status === 'failed') {
    document.getElementById('ws-dot').className = 'status-dot error'
    document.getElementById('ws-status-text').textContent = t('status_error')
    addActivity('ERROR: ' + (String(data?.error || '').trim() || 'Unknown'))
  } else if (status === 'cancelled') {
    document.getElementById('ws-dot').className = 'status-dot error'
    document.getElementById('ws-status-text').textContent = currentLang === 'zh' ? '已取消' : 'Cancelled'
    addActivity(currentLang === 'zh' ? '⚠️ 任务已取消' : '⚠️ Job cancelled')
  }

  clearRealtimeTracking()
  localStorage.removeItem('opendraft_job')
}

function applyStatusSnapshot(data = {}) {
  const status = normalizeJobStatus(data?.status)
  if (!status) return
  setJobStatus(status)

  if (status === 'outline_review') {
    const hasApprovalCard = Boolean(document.getElementById('approval-card'))
    if (reviewMode !== 'outline' || !hasApprovalCard) {
      showOutlineReview(data?.outline)
    }
    return
  }

  if (status === 'chapter_review') {
    const hasApprovalCard = Boolean(document.getElementById('approval-card'))
    const sectionKey = String(data?.review_chapter || data?.chapter || '')
    const sectionChanged = sectionKey && sectionKey !== currentSectionName
    if (reviewMode !== 'chapter' || !hasApprovalCard || sectionChanged) {
      showChapterReview({
        chapter: data?.review_chapter || data?.chapter,
        chapter_name: data?.review_chapter_name || data?.chapter_name,
        content: data?.review_content || data?.content,
      })
    }
    return
  }

  if (TERMINAL_JOB_STATUS.has(status)) {
    handleTerminalStatus({
      status,
      error: data?.error,
      pdf: data?.pdf,
      docx: data?.docx,
      md: data?.md,
    })
    return
  }

  if (reviewMode) {
    reviewMode = null
    hideApprovalCard()
  }
  setWorkspaceProcessingStatus()
}

async function refreshJobStateFromStatus(source = 'manual') {
  if (!currentJobId || isCurrentJobTerminal()) return null
  try {
    const response = await fetch(apiUrl(`/status/${encodeURIComponent(currentJobId)}`))
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    if (!data || data.error) return null
    applyStatusSnapshot(data)
    return data
  } catch (error) {
    if (source === 'sse_reconnect') {
      console.warn('status sync after stream error failed:', error)
    }
    return null
  }
}

function startStatusSync() {
  stopStatusSync()
  statusSyncTimer = setInterval(() => {
    if (!currentJobId || isCurrentJobTerminal()) return
    void refreshJobStateFromStatus('interval')
  }, STATUS_SYNC_INTERVAL_MS)
}

function scheduleSseReconnect(reason = 'sse_error') {
  if (!currentJobId || isCurrentJobTerminal()) return
  if (sseReconnectTimer) return

  sseReconnectAttempts += 1
  const delay = Math.min(
    SSE_RECONNECT_MAX_DELAY_MS,
    SSE_RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(sseReconnectAttempts - 1, 0))
  )

  if (sseReconnectAttempts === 1 || sseReconnectAttempts % 3 === 0) {
    addActivity(
      currentLang === 'zh'
        ? `⚠️ 实时连接中断，${Math.round(delay / 1000)} 秒后自动重连...`
        : `⚠️ Realtime stream disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`
    )
  }

  sseReconnectTimer = setTimeout(async () => {
    sseReconnectTimer = null
    if (!currentJobId || isCurrentJobTerminal()) return
    await refreshJobStateFromStatus('sse_reconnect')
    if (!currentJobId || isCurrentJobTerminal()) return
    connectSSE()
  }, delay)

  if (reason && sseReconnectAttempts > 1) {
    console.warn(`sse reconnect scheduled (${reason}), attempt=${sseReconnectAttempts}, delay=${delay}ms`)
  }
}

// ===== SSE =====
function connectSSE() {
  if (!currentJobId || isCurrentJobTerminal()) return
  closeEventStream()
  startStatusSync()

  if (!isCurrentJobTerminal() && normalizeJobStatus(currentJobStatus) === 'idle') {
    setJobStatus('running')
  }

  eventSource = new EventSource(apiUrl(`/stream/${encodeURIComponent(currentJobId)}`))
  eventSource.onopen = () => {
    sseReconnectAttempts = 0
  }
  eventSource.onmessage = (e) => {
    let data
    try {
      data = JSON.parse(e.data)
    } catch {
      return
    }
    resetSseReconnectState()

    if (data.error) {
      addActivity('Error: ' + data.error)
      return
    }
    if (data.type === 'log') {
      addActivity(data.msg)
      advanceProgress(data.msg)
      return
    }
    if (data.type === 'outline_review') {
      showOutlineReview(data.outline)
      return
    }
    if (data.type === 'chapter_review') {
      showChapterReview(data)
      return
    }
    if (data.type === 'done') {
      handleTerminalStatus(data)
    }
  }
  eventSource.onerror = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    scheduleSseReconnect('eventsource_error')
  }
}

// ===== RECOVERY =====
async function tryOpenJobFromQuery() {
  const params = new URLSearchParams(window.location.search)
  const queryJobId = String(params.get('jobId') || '').trim()
  if (!queryJobId) return false

  try {
    const response = await fetch(apiUrl('/papers'))
    if (!response.ok) return false

    const papers = await response.json().catch(() => [])
    if (!Array.isArray(papers)) return false

    const target = papers.find(item => String(item?.job_id || '').trim() === queryJobId)
    if (!target) return false

    const encodedTopic = encodeURIComponent(String(target?.topic || ''))
    const safeStatus = String(target?.status || 'running')
    return openPaper(queryJobId, encodedTopic, safeStatus)
  } catch (error) {
    console.error('open job from query failed:', error)
    return false
  }
}

function tryRecover() {
  const saved=localStorage.getItem('opendraft_job'); if(!saved) return;
  try{const info=JSON.parse(saved); currentJobId=info.job_id; startTime=info.start_time||Date.now();
  showWorkspace(info.topic||t('ws_recovering'), true);
  startTimer();
  fetch(apiUrl(`/status/${encodeURIComponent(currentJobId)}`)).then(r=>r.json()).then(data=>{
    if(data.error){localStorage.removeItem('opendraft_job');goBack();return;}
    if(data.log)data.log.forEach(msg=>{addActivity(msg);advanceProgress(msg);});
    applyStatusSnapshot(data)
    if(!isCurrentJobTerminal()){connectSSE();}
  }).catch(()=>{localStorage.removeItem('opendraft_job');goBack();});}catch{localStorage.removeItem('opendraft_job');}
}

// ===== INIT =====
/* Default word count & citation hints per academic level */
const LEVEL_DEFAULTS={
  research_paper:{words:'3,000-5,000',citations:8},
  bachelor:{words:'10,000-15,000',citations:12},
  master:{words:'25,000-30,000',citations:20},
  phd:{words:'50,000-80,000',citations:30}
};
function renderAssistantBillingEstimate() {
  const tipEl = document.getElementById('assistant-estimate-tip')
  const levelEl = document.getElementById('sf-level')
  if (!tipEl || !levelEl) return

  const estimateCredits = getAssistantLevelBillingPrice(levelEl.value)
  const creditsText = formatCreditsForDisplay(estimateCredits)
  if (currentLang === 'en') {
    tipEl.textContent = `Estimated deduction this run: ${creditsText} credits`
    return
  }
  tipEl.textContent = `此次调用预估扣除 ${creditsText} credits`
}

function updateDefaultHints(){
  const levelEl = document.getElementById('sf-level')
  if (!levelEl) return
  const lv=levelEl.value;
  const d=LEVEL_DEFAULTS[lv]||LEVEL_DEFAULTS.master;
  const wOpt=document.querySelector('#sf-words option[value=""]');
  const cOpt=document.querySelector('#sf-citations option[value=""]');
  if (!wOpt || !cOpt) return
  if(currentLang==='zh'){
    wOpt.textContent='默认（'+d.words+'字）';
    cOpt.textContent='默认（'+d.citations+'篇）';
  }else{
    wOpt.textContent='Default ('+d.words+' words)';
    cOpt.textContent='Default ('+d.citations+' refs)';
  }
  renderAssistantBillingEstimate()
}

const windowActionBindings = {
  setLang,
  showMyPapers,
  backToLanding,
  newPaper,
  openPaper,
  deletePaper,
  startWriting,
  confirmSettingsAndStart,
  approveAndContinue,
  goBack,
  switchRightTab,
  saveEdits,
  downloadFile,
  toggleSectionsPanel,
  toggleExpand,
}

let levelSelectEl = null
let topicInputEl = null
let topicInputResizeHandler = null
let topicInputKeydownHandler = null

onBeforeRouteLeave((_to, _from, next) => {
  if (!confirmLeaveIfNeeded()) {
    next(false)
    return
  }
  if (!shouldWarnProgressLoss()) {
    next()
    return
  }
  cancelCurrentJobIfRunning('route_leave')
    .catch((error) => {
      console.warn('cancel job on route leave failed:', error)
    })
    .finally(() => {
      next()
    })
})

onMounted(() => {
  Object.entries(windowActionBindings).forEach(([key, fn]) => {
    window[key] = fn
  })

  applyI18n();
  bindAccountPanel()
  updateDefaultHints();

  levelSelectEl = document.getElementById('sf-level');
  if (levelSelectEl) {
    levelSelectEl.addEventListener('change', updateDefaultHints);
  }

  document.querySelectorAll('.btn-lang').forEach(b=>b.classList.toggle('active',b.dataset.lang===currentLang));

  topicInputEl = document.getElementById('topic-input');
  if (topicInputEl) {
    topicInputResizeHandler = () => {
      topicInputEl.style.height = 'auto';
      topicInputEl.style.height = topicInputEl.scrollHeight + 'px';
    };
    topicInputKeydownHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startWriting();
    };
    topicInputEl.addEventListener('input', topicInputResizeHandler);
    topicInputEl.addEventListener('keydown', topicInputKeydownHandler);
  }

  void (async () => {
    const searchParams = new URLSearchParams(window.location.search || '')
    const freshFlag = String(searchParams.get('fresh') || '').trim().toLowerCase()
    const forceFreshEntry = freshFlag === '1' || freshFlag === 'true' || freshFlag === 'yes'

    if (forceFreshEntry) {
      localStorage.removeItem('opendraft_job')
      if (searchParams.has('fresh')) {
        searchParams.delete('fresh')
        const nextQuery = searchParams.toString()
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`
        window.history.replaceState(null, '', nextUrl)
      }
    }

    const openedFromQuery = await tryOpenJobFromQuery()
    if (!openedFromQuery && !forceFreshEntry) {
      tryRecover()
    }
  })()

  if (!beforeUnloadHandler) {
    beforeUnloadHandler = (event) => {
      if (!shouldWarnProgressLoss()) return
      event.preventDefault()
      event.returnValue = LEAVE_PROGRESS_WARNING_TEXT
      return LEAVE_PROGRESS_WARNING_TEXT
    }
  }
  if (!unloadHandler) {
    unloadHandler = () => {
      if (!shouldWarnProgressLoss()) return
      sendCancelJobBeacon('browser_unload')
    }
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)
  window.addEventListener('unload', unloadHandler)
});

onBeforeUnmount(() => {
  void cancelCurrentJobIfRunning('component_unmount')
  unbindAccountPanel()
  clearRealtimeTracking()

  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  if (levelSelectEl) {
    levelSelectEl.removeEventListener('change', updateDefaultHints)
    levelSelectEl = null
  }

  if (topicInputEl && topicInputResizeHandler) {
    topicInputEl.removeEventListener('input', topicInputResizeHandler)
  }
  if (topicInputEl && topicInputKeydownHandler) {
    topicInputEl.removeEventListener('keydown', topicInputKeydownHandler)
  }
  topicInputEl = null
  topicInputResizeHandler = null
  topicInputKeydownHandler = null

  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler)
  }
  if (unloadHandler) {
    window.removeEventListener('unload', unloadHandler)
  }

  Object.entries(windowActionBindings).forEach(([key, fn]) => {
    if (window[key] === fn) {
      delete window[key]
    }
  })
})
</script>

<style>
.opendraft-assistant-page {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  --bg: #f5f6fa; --bg-card: #fff; --bg-input: #f0f1f5; --border: #e0e2ea;
  --text: #1e293b; --text-dim: #64748b; --accent: #6366f1; --accent-hover: #4f46e5;
  --accent-glow: rgba(99,102,241,0.12); --green: #16a34a; --yellow: #ca8a04;
  --panel-bg: #fafbfd; --panel-border: #e8eaf0;
  --shadow: 0 1px 3px rgba(0,0,0,0.06); --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
}

.opendraft-assistant-page,
.opendraft-assistant-page *,
.opendraft-assistant-page *::before,
.opendraft-assistant-page *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ===== PAGE: LANDING ===== */
#landing { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; padding:2rem; }
#landing.hidden { display:none; }
.landing-top { position:absolute; top:1rem; right:1.5rem; display:flex; gap:0.5rem; }
.btn-lang { background:var(--bg-card); border:1px solid var(--border); color:var(--text-dim); padding:0.35rem 0.75rem; border-radius:8px; font-size:0.8rem; cursor:pointer; }
.btn-lang:hover { border-color:var(--accent); color:var(--accent); }
.btn-lang.active { background:var(--accent); color:#fff; border-color:var(--accent); }
.landing-top-left { position:absolute; top:1rem; left:1.5rem; display:flex; flex-direction:column; align-items:flex-start; gap:0.6rem; z-index:2; }
.landing-account-card { width:232px; }
.account-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #dbeafe;
  border: 2px solid #bfdbfe;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  flex-shrink: 0;
}
.account-line {
  margin: 0;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
}
.account-label {
  width: 76px;
  flex-shrink: 0;
}
.account-value {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.credits-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.credits-text {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
}
.refresh-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.refresh-btn:hover:not(:disabled) { border-color: #94a3b8; }
.refresh-btn:disabled { opacity: 0.65; cursor: not-allowed; }
.account-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.account-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  height: 30px;
  font-size: 12px;
  cursor: pointer;
}
.account-btn.secondary:hover { border-color: #94a3b8; }
.account-btn.danger { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
.account-btn.danger:hover { border-color: #fca5a5; }
.btn-my-papers { background:var(--bg-card); border:1px solid var(--border); color:var(--text); padding:0.4rem 1rem; border-radius:8px; font-size:0.85rem; cursor:pointer; font-weight:500; display:flex; align-items:center; gap:0.4rem; }
.btn-my-papers:hover { border-color:var(--accent); color:var(--accent); }
.landing-title { font-size:2.4rem; font-weight:700; margin-bottom:0.5rem; background:linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.landing-sub { color:var(--text-dim); font-size:1rem; margin-bottom:2.5rem; }
.input-box { width:100%; max-width:680px; background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:1.25rem 1.5rem; box-shadow:var(--shadow-md); transition:border-color 0.2s,box-shadow 0.2s; }
.input-box:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow),var(--shadow-md); }
.input-box textarea { width:100%; background:transparent; border:none; outline:none; color:var(--text); font-size:1rem; resize:none; min-height:56px; max-height:160px; line-height:1.6; font-family:inherit; }
.input-box textarea::placeholder { color:var(--text-dim); }
.input-actions { display:flex; align-items:center; justify-content:flex-end; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border); }
.btn-generate { background:var(--accent); color:#fff; border:none; padding:0.55rem 1.6rem; border-radius:10px; font-size:0.95rem; font-weight:600; cursor:pointer; box-shadow:0 2px 8px rgba(99,102,241,0.25); }
.btn-generate:hover { background:var(--accent-hover); }
.btn-generate:disabled { opacity:0.5; cursor:not-allowed; }

/* ===== PAGE: MY PAPERS ===== */
#my-papers { display:none; flex-direction:column; height:100vh; overflow:hidden; }
#my-papers.active { display:flex; }
.papers-header { display:flex; align-items:center; padding:1.25rem 2rem; background:var(--bg-card); border-bottom:1px solid var(--border); box-shadow:var(--shadow); gap:1rem; }
.papers-header h1 { font-size:1.3rem; font-weight:700; flex:1; background:linear-gradient(135deg,#6366f1,#8b5cf6); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.papers-back { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1.2rem; padding:0.3rem; border-radius:6px; }
.papers-back:hover { color:var(--text); }
.btn-new-paper { background:var(--accent); color:#fff; border:none; padding:0.45rem 1.2rem; border-radius:8px; font-size:0.85rem; font-weight:600; cursor:pointer; }
.btn-new-paper:hover { background:var(--accent-hover); }
.papers-body { flex:1; overflow-y:auto; padding:2rem; }
.papers-grid { max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:0.75rem; }
.paper-card { background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:1.25rem 1.5rem; cursor:pointer; transition:border-color 0.2s,box-shadow 0.2s; display:flex; align-items:center; gap:1rem; }
.paper-card:hover { border-color:var(--accent); box-shadow:var(--shadow-md); }
.paper-card.disabled { cursor:not-allowed; opacity:0.82; }
.paper-card.disabled:hover { border-color:var(--border); box-shadow:none; }
.paper-status-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.paper-status-dot.done { background:var(--green); }
.paper-status-dot.running { background:var(--yellow); animation:pulse 1.5s infinite; }
.paper-status-dot.cancelled { background:#94a3b8; }
.paper-status-dot.error { background:#ef4444; }
.paper-info { flex:1; min-width:0; }
.paper-info .paper-topic { font-weight:600; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.paper-info .paper-meta { font-size:0.78rem; color:var(--text-dim); margin-top:0.25rem; }
.paper-delete { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:0.9rem; padding:0.3rem 0.5rem; border-radius:6px; opacity:0; transition:opacity 0.2s; }
.paper-card:hover .paper-delete { opacity:1; }
.paper-delete:hover { color:#ef4444; background:rgba(239,68,68,0.08); }
.papers-empty { text-align:center; color:var(--text-dim); padding:4rem 1rem; font-size:0.95rem; }


/* Clickable activity items */
.activity-item.clickable { cursor:pointer; border-radius:6px; transition:background 0.15s; }
.activity-item.clickable:hover { background:rgba(99,102,241,0.06); }
.activity-item .source-link { color:var(--accent); text-decoration:none; cursor:pointer; display:block; padding:0.15rem 0; }
.activity-item .source-link:hover { text-decoration:underline; }

/* Expandable sources */
.expand-toggle { cursor:pointer; color:var(--accent); font-weight:500; display:inline-flex; align-items:center; gap:0.3rem; }
.expand-toggle:hover { text-decoration:underline; }
.expand-arrow { font-size:0.6rem; transition:transform 0.2s; display:inline-block; }
.expand-arrow.open { transform:rotate(90deg); }
.expand-list { margin-top:0.35rem; padding-left:0.2rem; display:flex; flex-direction:column; gap:0.1rem; font-size:0.78rem; max-height:240px; overflow-y:auto; }
.expand-list a, .expand-list span { display:block; padding:0.2rem 0.4rem; border-radius:4px; line-height:1.4; }
.expand-list a:hover { background:rgba(99,102,241,0.06); }
.expand-list span { color:var(--text-dim); }


/* ===== PAGE: WORKSPACE ===== */
#workspace { display:none; height:100vh; flex-direction:column; }
#workspace.active { display:flex; }
.topbar { display:flex; align-items:center; padding:0.6rem 1.25rem; background:var(--bg-card); border-bottom:1px solid var(--border); gap:1rem; flex-shrink:0; box-shadow:var(--shadow); }
.topbar-back { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1.1rem; padding:0.3rem; border-radius:6px; }
.topbar-back:hover { color:var(--text); }
.topbar-title { font-size:0.9rem; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.topbar-my-papers { background:none; border:1px solid var(--border); color:var(--text-dim); padding:0.3rem 0.7rem; border-radius:7px; font-size:0.78rem; cursor:pointer; }
.topbar-my-papers:hover { border-color:var(--accent); color:var(--accent); }
.topbar-account { display:flex; align-items:center; gap:0.5rem; padding:0.2rem 0.5rem; border:1px solid var(--border); border-radius:8px; background:var(--bg-card); color:var(--text-dim); font-size:0.76rem; white-space:nowrap; }
.topbar-account #ws-username { max-width:140px; overflow:hidden; text-overflow:ellipsis; }
.topbar-account #ws-credits { font-weight:600; color:var(--text); }
.topbar-credits-btn { background:var(--bg-input); border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:0.2rem 0.55rem; font-size:0.72rem; cursor:pointer; }
.topbar-credits-btn:hover { border-color:var(--accent); color:var(--accent); }
.topbar-credits-btn:disabled { opacity:0.55; cursor:not-allowed; }
.topbar-status { display:flex; align-items:center; gap:0.4rem; font-size:0.8rem; color:var(--text-dim); }
.status-dot { width:8px; height:8px; border-radius:50%; background:var(--yellow); animation:pulse 1.5s infinite; }
.status-dot.done { background:var(--green); animation:none; }
.status-dot.error { background:#ef4444; animation:none; }
.status-dot.paused { background:var(--accent); animation:pulse 1s infinite; }
.status-dot.settings { background:var(--accent); animation:none; }
@keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
.topbar-progress { width:120px; height:4px; background:var(--border); border-radius:2px; overflow:hidden; }
.topbar-progress-fill { height:100%; background:var(--accent); border-radius:2px; transition:width 0.5s; width:0%; }
.topbar-time { font-size:0.75rem; color:var(--text-dim); min-width:60px; text-align:right; }

/* Panels */
.panels { display:flex; flex:1; overflow:hidden; }
.panel-left { width:440px; min-width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel-bg); }
.panel-left-header { padding:0.75rem 1rem; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); border-bottom:1px solid var(--panel-border); display:flex; align-items:center; gap:0.5rem; }
.panel-left-header .tab { padding:0.3rem 0.75rem; border-radius:6px; cursor:pointer; }
.panel-left-header .tab.active { background:var(--bg-input); color:var(--text); font-weight:500; }
#activity-container { flex:1; overflow-y:auto; padding:0.5rem 0.75rem; }

/* Completed sections panel */
#sections-panel { display:none; padding:0.6rem 0.75rem; border-bottom:1px solid var(--panel-border); flex-shrink:0; position:relative; }
#sections-panel.visible { display:block; }
.sections-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); font-weight:600; margin-bottom:0.45rem; }
.sections-grid { display:flex; flex-wrap:wrap; gap:0.4rem; }
.sections-grid.collapsed { display:none; }
.sections-toggle { display:flex; justify-content:center; padding:0.15rem 0 0.05rem; opacity:0; transition:opacity 0.2s; }
#sections-panel:hover .sections-toggle { opacity:1; }
.sections-toggle-btn { background:none; border:none; cursor:pointer; color:var(--text-dim); font-size:0.55rem; padding:0.15rem 1.2rem; border-radius:4px; transition:background 0.15s,color 0.15s; line-height:1; }
.sections-toggle-btn:hover { background:var(--bg-input); color:var(--accent); }
.section-card { display:flex; align-items:center; gap:0.4rem; padding:0.4rem 0.7rem; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; cursor:pointer; font-size:0.78rem; font-weight:500; color:var(--text); transition:all 0.2s; box-shadow:var(--shadow); white-space:nowrap; }
.section-card:hover { border-color:var(--accent); color:var(--accent); box-shadow:0 2px 8px var(--accent-glow); transform:translateY(-1px); }
.section-card.active { border-color:var(--accent); background:var(--accent-glow); color:var(--accent); }
.section-card .sc-icon { font-size:0.85rem; flex-shrink:0; }
.section-card .sc-dot { width:6px; height:6px; border-radius:50%; background:var(--green); flex-shrink:0; }

/* Settings form in left panel */
.settings-form-panel { padding:1.25rem; overflow-y:auto; flex:1; }
.settings-form-panel h3 { font-size:0.85rem; font-weight:600; margin-bottom:1rem; color:var(--text); }
.sf-section { margin-bottom:1.25rem; }
.sf-section-title { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); margin-bottom:0.75rem; font-weight:500; }
.sf-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.65rem; }
.sf-field label { display:block; font-size:0.78rem; color:var(--text-dim); margin-bottom:0.25rem; }
.sf-field input,.sf-field select { width:100%; background:var(--bg-input); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:0.45rem 0.65rem; font-size:0.85rem; outline:none; font-family:inherit; }
.sf-field input:focus,.sf-field select:focus { border-color:var(--accent); }
.sf-field textarea { width:100%; background:var(--bg-input); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:0.45rem 0.65rem; font-size:0.85rem; outline:none; resize:vertical; font-family:inherit; }
.sf-formats { display:flex; gap:1rem; }
.sf-formats label { display:flex; align-items:center; gap:0.35rem; font-size:0.85rem; cursor:pointer; }
.sf-formats input[type=checkbox] { accent-color:var(--accent); }
.btn-start-writing { width:100%; background:var(--accent); color:#fff; border:none; padding:0.65rem 1.5rem; border-radius:10px; font-size:0.95rem; font-weight:600; cursor:pointer; box-shadow:0 2px 8px rgba(99,102,241,0.25); margin-top:0.5rem; }
.btn-start-writing:hover { background:var(--accent-hover); }
.btn-start-writing:disabled { opacity:0.5; cursor:not-allowed; }
.assistant-estimate-tip { margin-top:0.45rem; font-size:0.8rem; color:#1d4ed8; line-height:1.45; }

/* Phase groups & activity items */
.phase-group { margin-bottom:0.5rem; }
.phase-header { display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.4rem; font-weight:600; font-size:0.88rem; }
.phase-icon { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:0.82rem; flex-shrink:0; }
.phase-icon.init { background:#ede9fe; color:#7c3aed; }
.phase-icon.research { background:#dcfce7; color:#16a34a; }
.phase-icon.outline { background:#fef9c3; color:#ca8a04; }
.phase-icon.writing { background:#dbeafe; color:#2563eb; }
.phase-icon.compile { background:#fce7f3; color:#db2777; }
.phase-icon.export { background:#ccfbf1; color:#0d9488; }
.phase-icon.done { background:#dcfce7; color:#16a34a; }
.activity-item { display:flex; align-items:flex-start; gap:0.5rem; padding:0.3rem 0.4rem 0.3rem 2.6rem; font-size:0.82rem; line-height:1.5; animation:fadeSlide 0.3s ease; }
@keyframes fadeSlide { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
.activity-bullet { width:6px; height:6px; border-radius:50%; background:var(--border); flex-shrink:0; margin-top:0.45rem; }
.activity-bullet.highlight { background:var(--accent); }
.activity-bullet.found { background:var(--green); }
.activity-bullet.refining { background:var(--yellow); animation: pulse-refine 1.2s ease-in-out infinite; }
.activity-bullet.refined { background:var(--yellow); }
@keyframes pulse-refine { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
.activity-text { flex:1; min-width:0; word-break:break-word; }
.activity-time { font-size:0.7rem; color:var(--text-dim); flex-shrink:0; }
.phase-spinner { width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; margin-left:auto; }
@keyframes spin { to{transform:rotate(360deg);} }
.phase-check { margin-left:auto; color:var(--green); font-size:0.9rem; }

/* AI thinking bubble */
.ai-thinking { background:linear-gradient(135deg,#ede9fe,#dbeafe); border-radius:12px; padding:1rem 1.25rem; margin:0.5rem 0.25rem; animation:fadeSlide 0.3s ease; }
.ai-thinking .ai-thinking-label { font-size:0.75rem; color:var(--accent); font-weight:600; margin-bottom:0.4rem; text-transform:uppercase; letter-spacing:0.04em; }
.ai-thinking .ai-thinking-text { font-size:0.85rem; line-height:1.6; color:var(--text); }

/* Right panel */
.panel-right { flex:1; display:flex; flex-direction:column; background:#fff; }
.panel-right-header { padding:0.6rem 1rem; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); flex-shrink:0; }
.panel-right-tabs { display:flex; gap:0.25rem; }
.panel-right-tabs button { background:none; border:1px solid transparent; color:var(--text-dim); padding:0.35rem 0.85rem; border-radius:7px; font-size:0.82rem; cursor:pointer; }
.panel-right-tabs button.active { background:var(--bg-input); border-color:var(--border); color:var(--text); }
.panel-right-actions { display:flex; gap:0.4rem; }
.btn-action { background:var(--bg-input); border:1px solid var(--border); color:var(--text-dim); padding:0.35rem 0.75rem; border-radius:7px; font-size:0.8rem; cursor:pointer; }
.btn-action:hover { border-color:var(--accent); color:var(--text); }
.btn-action:disabled { opacity:0.4; cursor:not-allowed; }
#preview-area { flex:1; overflow-y:auto; padding:2rem 2.5rem; }
#preview-area .placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-dim); font-size:0.95rem; gap:0.75rem; }
.placeholder-icon { font-size:3rem; opacity:0.25; }
.paper-content { max-width:760px; margin:0 auto; font-family:'Georgia','Times New Roman','SimSun',serif; font-size:14px; line-height:1.85; color:#1e293b; }
.paper-content h1 { font-size:1.5rem; font-weight:700; margin:2rem 0 0.8rem; padding-bottom:0.4rem; border-bottom:1px solid var(--border); font-family:-apple-system,sans-serif; }
.paper-content h2 { font-size:1.2rem; font-weight:600; margin:1.5rem 0 0.6rem; font-family:-apple-system,sans-serif; }
.paper-content h3 { font-size:1.05rem; margin:1.2rem 0 0.5rem; font-family:-apple-system,sans-serif; }
.paper-content p { margin-bottom:0.75rem; text-align:justify; }
.paper-content ul,.paper-content ol { margin:0.5rem 0 0.75rem 1.5rem; }
.paper-content li { margin-bottom:0.25rem; }
.paper-content blockquote { border-left:3px solid var(--accent); padding-left:1rem; color:var(--text-dim); margin:1rem 0; }
.paper-content table { width:100%; border-collapse:collapse; margin:1rem 0; font-size:0.9rem; }
.paper-content th, .paper-content td { border:1px solid var(--border); padding:0.5rem 0.75rem; }
.paper-content th { background:var(--bg-input); font-weight:600; }
.paper-content tr:nth-child(even) { background:rgba(0,0,0,0.02); }
#editor-area { flex:1; overflow:hidden; display:none; }
#editor-area textarea { width:100%; height:100%; background:var(--panel-bg); color:var(--text); border:none; outline:none; padding:2rem 2.5rem; font-family:'SF Mono','Menlo',monospace; font-size:0.88rem; line-height:1.7; resize:none; }

/* Approval floating card */
.approval-card { display:none; margin:0.5rem 0; padding:0.65rem 0.75rem; background:linear-gradient(135deg,#ede9fe,#dbeafe); border:1px solid rgba(99,102,241,0.25); border-radius:10px; gap:0.5rem; flex-direction:column; box-shadow:0 2px 12px rgba(99,102,241,0.12); animation:approval-in 0.3s ease; }
.approval-card.show { display:flex; }
@keyframes approval-in { from{opacity:0;transform:translateY(-6px);} to{opacity:1;transform:translateY(0);} }
.approval-card .info { font-size:0.82rem; color:var(--text); }
.approval-card .info strong { color:var(--accent); }
.btn-approve { background:var(--accent); color:#fff; border:none; padding:0.4rem 1rem; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer; align-self:flex-end; }
.btn-approve:hover { background:var(--accent-hover); }

/* Download bar */
.download-bar { display:none; padding:0.75rem 1rem; background:var(--bg-card); border-top:1px solid var(--border); gap:0.5rem; align-items:center; flex-shrink:0; }
.download-bar.show { display:flex; }
.download-bar span { font-size:0.82rem; color:var(--text-dim); margin-right:auto; }
.btn-dl { background:var(--accent); color:#fff; border:none; padding:0.4rem 1rem; border-radius:7px; font-size:0.82rem; font-weight:600; cursor:pointer; }
.btn-dl:hover { background:var(--accent-hover); }
.btn-dl.secondary { background:transparent; border:1px solid var(--border); color:var(--text); }

.opendraft-assistant-page ::-webkit-scrollbar { width:6px; }
.opendraft-assistant-page ::-webkit-scrollbar-track { background:transparent; }
.opendraft-assistant-page ::-webkit-scrollbar-thumb { background:#ccc; border-radius:3px; }
@media (max-width:900px) {
  .landing-top-left { left:1rem; top:0.75rem; }
  .landing-account-card { width:min(72vw,220px); }
  .account-actions { grid-template-columns:1fr; }
  .panels { flex-direction:column; }
  .panel-left { width:100%; height:40vh; border-right:none; border-bottom:1px solid var(--border); }
}
@media (max-width:1200px) {
  .topbar-account #ws-username { display:none; }
}
</style>
