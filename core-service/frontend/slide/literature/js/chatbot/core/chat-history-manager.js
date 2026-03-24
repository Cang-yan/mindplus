// chat-history-manager.js
// 聊天历史管理模块 - Assistant 历史统一走后端 API（落库）

(function() {
  'use strict';

  // =============== 后端能力检测 ===============

  /**
   * 判断聊天历史后端接口能力是否可用
   * @returns {boolean}
   */
  function hasBackendChatStorage() {
    return !!(window.storageAdapter &&
      typeof window.storageAdapter.loadChatHistory === 'function' &&
      typeof window.storageAdapter.saveChatMessage === 'function' &&
      typeof window.storageAdapter.replaceChatHistory === 'function' &&
      typeof window.storageAdapter.clearChatHistory === 'function');
  }

  const backendSyncTimers = new Map();
  const BACKEND_SYNC_DELAY = 800;

  function scheduleBackendHistorySync(docId, history) {
    if (!docId || !window.storageAdapter || typeof window.storageAdapter.replaceChatHistory !== 'function') {
      return;
    }

    const safeHistory = Array.isArray(history) ? history : [];
    const previous = backendSyncTimers.get(docId);
    if (previous) {
      clearTimeout(previous);
    }

    const timerId = setTimeout(async () => {
      backendSyncTimers.delete(docId);
      try {
        // 使用 JSON 序列化做一层快照，避免定时期间被后续状态修改污染
        const snapshot = JSON.parse(JSON.stringify(safeHistory));
        await window.storageAdapter.replaceChatHistory(docId, snapshot);
      } catch (error) {
        console.error('[scheduleBackendHistorySync] Error syncing history to backend:', error);
      }
    }, BACKEND_SYNC_DELAY);

    backendSyncTimers.set(docId, timerId);
  }

  // =============== 对话历史持久化 ===============

  /**
   * 保存当前文档的聊天历史
   * @param {string} docId
   * @param {Array} history
   */
  async function saveChatHistory(docId, history) {
    try {
      if (hasBackendChatStorage()) {
        // 后端模式：采用节流同步，兼顾实时性与请求压力。
        scheduleBackendHistorySync(docId, history);
      } else {
        // 严格后端落库：不再回退 localStorage
        console.warn('[saveChatHistory] Backend chat storage unavailable, skip persisting history.');
      }
    } catch (e) {
      console.error('[saveChatHistory] Error saving chat history:', e);
    }
  }

  /**
   * 保存单条聊天消息（优化版，用于后端模式）
   * @param {string} docId
   * @param {Object} message - { role, content, metadata }
   */
  async function saveSingleMessage(docId, message) {
    if (!hasBackendChatStorage()) {
      // 严格后端落库：无后端能力时不做本地持久化
      return;
    }

    try {
      await window.storageAdapter.saveChatMessage(docId, {
        role: message.role,
        content: message.content,
        metadata: message.metadata || {}
      });
    } catch (e) {
      console.error('[saveSingleMessage] Error saving message to backend:', e);
    }
  }

  /**
   * 加载当前文档的聊天历史
   * @param {string} docId
   * @returns {Promise<Array>}
   */
  async function loadChatHistory(docId) {
    try {
      let history = [];

      if (hasBackendChatStorage()) {
        // 后端模式：从 API 加载
        history = await window.storageAdapter.loadChatHistory(docId);
      } else {
        // 严格后端落库：无后端能力时返回空历史
        console.warn('[loadChatHistory] Backend chat storage unavailable, return empty history.');
      }

      // 清理可能包含未正确格式化的toolCallHtml（修复旧版本的兼容性问题）
      history.forEach(msg => {
        if (msg.toolCallHtml && typeof msg.toolCallHtml === 'string') {
          // 检查是否包含超大的未格式化JSON数据（可能导致显示问题）
          const hasLargeJsonData = msg.toolCallHtml.includes('tool-step-detail">{') &&
                                   msg.toolCallHtml.length > 10000;

          // 检查是否有HTML结构被破坏的迹象（如不匹配的div标签）
          const openDivs = (msg.toolCallHtml.match(/<div/g) || []).length;
          const closeDivs = (msg.toolCallHtml.match(/<\/div>/g) || []).length;
          const structureBroken = Math.abs(openDivs - closeDivs) > 2;

          if (hasLargeJsonData || structureBroken) {
            console.warn('[loadChatHistory] 检测到有问题的toolCallHtml，已清除', {
              hasLargeJsonData,
              structureBroken,
              length: msg.toolCallHtml.length
            });
            delete msg.toolCallHtml;
          }
        }
      });

      return history;
    } catch (e) {
      console.error('[loadChatHistory] Error loading chat history:', e);
      return [];
    }
  }

  /**
   * 清空当前文档的聊天历史
   * @param {string} docId
   */
  async function clearChatHistory(docId) {
    try {
      const pending = backendSyncTimers.get(docId);
      if (pending) {
        clearTimeout(pending);
        backendSyncTimers.delete(docId);
      }

      if (hasBackendChatStorage()) {
        // 后端模式：调用 API 清空
        await window.storageAdapter.clearChatHistory(docId);
      } else {
        // 严格后端落库：无后端能力时仅清理内存，不做本地持久化
        console.warn('[clearChatHistory] Backend chat storage unavailable, skip clearing persisted history.');
      }
    } catch (e) {
      console.error('[clearChatHistory] Error clearing chat history:', e);
    }
  }

  /**
   * 重新加载当前文档的聊天历史，并刷新UI
   * @param {function} updateChatbotUI
   * @param {function} getCurrentDocId - 获取当前文档ID的函数
   * @param {Array} chatHistory - 聊天历史数组的引用
   */
  async function reloadChatHistoryAndUpdateUI(updateChatbotUI, getCurrentDocId, chatHistory) {
    const docId = getCurrentDocId();
    const loaded = await loadChatHistory(docId);
    chatHistory.length = 0;
    loaded.forEach(m => chatHistory.push(m));
    if (typeof updateChatbotUI === 'function') updateChatbotUI();
  }

  /**
   * 清空当前文档的聊天历史（内存和存储），并刷新UI
   * @param {function} updateChatbotUI - 更新UI的回调函数
   * @param {function} getCurrentDocId - 获取当前文档ID的函数
   * @param {Array} chatHistory - 聊天历史数组的引用
   */
  async function clearCurrentDocChatHistory(updateChatbotUI, getCurrentDocId, chatHistory) {
    const docId = getCurrentDocId();
    chatHistory.length = 0; // 清空内存中的历史
    await clearChatHistory(docId); // 清除存储
    console.log(`Chat history for docId '${docId}' cleared.`);
    if (typeof updateChatbotUI === 'function') {
      updateChatbotUI(); // 刷新UI
    }
  }

  /**
   * 删除指定索引的聊天消息
   * @param {string} docId 当前文档的ID
   * @param {number} index 要删除消息的索引
   * @param {function} updateUIAfterDelete 删除后更新UI的回调函数
   * @param {Array} chatHistory - 聊天历史数组的引用
   */
  async function deleteMessageFromHistory(docId, index, updateUIAfterDelete, chatHistory) {
    if (index >= 0 && index < chatHistory.length) {
      chatHistory.splice(index, 1); // 从数组中移除消息

      if (hasBackendChatStorage()) {
        if (window.storageAdapter && typeof window.storageAdapter.replaceChatHistory === 'function') {
          await window.storageAdapter.replaceChatHistory(docId, chatHistory);
        } else {
          // 后端模式降级：重新同步整个历史
          await clearChatHistory(docId);
          for (const msg of chatHistory) {
            await saveSingleMessage(docId, msg);
          }
        }
      } else {
        // 严格后端落库：无后端能力时仅更新内存
        console.warn('[deleteMessageFromHistory] Backend chat storage unavailable, skip persisting history.');
      }

      console.log(`Message at index ${index} for docId '${docId}' deleted.`);
      if (typeof updateUIAfterDelete === 'function') {
        updateUIAfterDelete(); // 调用回调更新UI
      }
    } else {
      console.error(`[deleteMessageFromHistory] Invalid index: ${index} for chatHistory of length ${chatHistory.length}`);
    }
  }

  // 导出
  window.ChatHistoryManager = {
    saveChatHistory,
    saveSingleMessage, // 新增：用于后端模式逐条保存
    loadChatHistory,
    clearChatHistory,
    reloadChatHistoryAndUpdateUI,
    clearCurrentDocChatHistory,
    deleteMessageFromHistory
  };

})();
