/**
 * CloudScale Frontend Application Logic
 * Telemetry polling, task management, and health probe testing
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const valHostname = document.getElementById('valHostname');
  const valNamespace = document.getElementById('valNamespace');
  const valUptime = document.getElementById('valUptime');
  const valNodeVer = document.getElementById('valNodeVer');
  const valMemoryPercent = document.getElementById('valMemoryPercent');
  const valMemoryFill = document.getElementById('valMemoryFill');
  const valMemoryDetail = document.getElementById('valMemoryDetail');
  const valPlatformArch = document.getElementById('valPlatformArch');
  const valCpuCores = document.getElementById('valCpuCores');

  const tPodName = document.getElementById('tPodName');
  const tPodNamespace = document.getElementById('tPodNamespace');
  const tNodeName = document.getElementById('tNodeName');
  const tEnvMode = document.getElementById('tEnvMode');

  const btnPingProbe = document.getElementById('btnPingProbe');
  const probeResult = document.getElementById('probeResult');

  const taskListContainer = document.getElementById('taskListContainer');
  const addTaskForm = document.getElementById('addTaskForm');
  const taskInput = document.getElementById('taskInput');
  const taskCountBadge = document.getElementById('taskCountBadge');
  const terminalLogs = document.getElementById('terminalLogs');

  // Helper: format seconds to human-readable
  function formatSeconds(secs) {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  // Fetch System Metrics & Cluster Telemetry
  async function fetchSystemMetrics() {
    try {
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error('Failed to fetch system data');
      const data = await res.json();

      // Metrics Cards
      valHostname.textContent = data.container.hostname;
      valNamespace.textContent = `Namespace: ${data.container.podNamespace}`;
      valUptime.textContent = formatSeconds(data.application.processUptimeSeconds);
      valNodeVer.textContent = `${data.application.nodeVersion} (${data.hardware.platform})`;

      valMemoryPercent.textContent = `${data.hardware.memory.usagePercent}%`;
      valMemoryFill.style.width = `${Math.min(100, data.hardware.memory.usagePercent)}%`;
      valMemoryDetail.textContent = `${data.hardware.memory.usedMB} MB / ${data.hardware.memory.totalMB} MB`;

      valPlatformArch.textContent = `${data.hardware.platform} (${data.hardware.arch})`;
      valCpuCores.textContent = `${data.hardware.cpuCount} Core(s) - ${data.hardware.cpuModel.split(' ')[0]}`;

      // Telemetry Table
      tPodName.textContent = data.container.podName;
      tPodNamespace.textContent = data.container.podNamespace;
      tNodeName.textContent = data.container.nodeName;
      tEnvMode.textContent = `${data.application.environment} (Port: ${data.application.port})`;

      // Render Logs
      if (data.recentLogs && data.recentLogs.length > 0) {
        renderLogs(data.recentLogs);
      }
    } catch (err) {
      console.warn('Telemetry fetch error:', err);
    }
  }

  // Render logs
  function renderLogs(logs) {
    terminalLogs.innerHTML = '';
    logs.forEach(log => {
      const line = document.createElement('div');
      line.className = 'log-line';
      const statusClass = log.statusCode < 400 ? 'success' : 'warn';
      line.innerHTML = `
        <span style="color: #64748b;">[${log.time}]</span>
        <span style="color: #38bdf8; font-weight:600;">${log.method}</span>
        <span>${log.url}</span>
        <span class="${statusClass}">HTTP ${log.statusCode}</span>
        <span style="color: #64748b;">(${log.durationMs}ms)</span>
      `;
      terminalLogs.appendChild(line);
    });
  }

  // Fetch Tasks
  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      const json = await res.json();
      if (json.success) {
        renderTasks(json.data);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    }
  }

  // Render Tasks
  function renderTasks(tasks) {
    taskListContainer.innerHTML = '';
    const completedCount = tasks.filter(t => t.completed).length;
    taskCountBadge.textContent = `${completedCount}/${tasks.length} Completed`;

    if (tasks.length === 0) {
      taskListContainer.innerHTML = '<div style="color:#64748b; font-size:0.85rem; padding:1rem; text-align:center;">No tasks found. Add a task above!</div>';
      return;
    }

    tasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'task-item';

      const left = document.createElement('div');
      left.className = 'task-left';
      left.onclick = () => toggleTask(task.id);

      const check = document.createElement('div');
      check.className = `task-check ${task.completed ? 'checked' : ''}`;
      if (task.completed) {
        check.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      }

      const text = document.createElement('span');
      text.className = `task-text ${task.completed ? 'completed' : ''}`;
      text.textContent = task.title;

      left.appendChild(check);
      left.appendChild(text);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.title = 'Delete Task';
      delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteTask(task.id);
      };

      item.appendChild(left);
      item.appendChild(delBtn);
      taskListContainer.appendChild(item);
    });
  }

  // Toggle Task Completion
  async function toggleTask(id) {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'POST' });
      if (res.ok) fetchTasks();
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  }

  // Delete Task
  async function deleteTask(id) {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) fetchTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  }

  // Add Task
  addTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = taskInput.value.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        taskInput.value = '';
        fetchTasks();
      }
    } catch (err) {
      console.error('Error adding task:', err);
    }
  });

  // Health Probe Ping Button
  btnPingProbe.addEventListener('click', async () => {
    probeResult.textContent = 'Probing...';
    probeResult.style.color = '#38bdf8';
    const start = performance.now();
    try {
      const res = await fetch('/api/ping');
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        probeResult.textContent = `200 OK (${elapsed}ms)`;
        probeResult.style.color = '#10b981';
      } else {
        probeResult.textContent = `HTTP ${res.status} (${elapsed}ms)`;
        probeResult.style.color = '#f59e0b';
      }
    } catch (err) {
      probeResult.textContent = 'Connection Error';
      probeResult.style.color = '#ef4444';
    }
  });

  // Initial loads and recurring interval
  fetchSystemMetrics();
  fetchTasks();
  setInterval(fetchSystemMetrics, 3000);
});
