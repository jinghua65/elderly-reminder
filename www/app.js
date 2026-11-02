// ================= 1. 药品管理逻辑 =================
function renderMedications() {
    const listContainer = document.getElementById('med-list');
    const meds = JSON.parse(localStorage.getItem('medications') || '[]');
    if(meds.length === 0) {
        listContainer.innerHTML = '<p style="font-size:16px; color:#888;">暂无提醒，请添加。</p>';
        return;
    }
    listContainer.innerHTML = '';
    meds.forEach((med, index) => {
        const item = document.createElement('div');
        item.className = 'med-item';
        item.innerHTML = `
            <div class="med-info">
                <h3>⏰ ${med.time} - ${med.name}</h3>
                <p>用量：${med.dose}</p>
            </div>
            <button class="btn-delete" onclick="deleteMedication(${index})">删除</button>
        `;
        listContainer.appendChild(item);
    });
}
function addMedication() {
    const name = document.getElementById('input-name').value.trim();
    const dose = document.getElementById('input-dose').value.trim();
    const time = document.getElementById('input-time').value;
    if(!name || !dose) { alert("请填写完整！"); return; }
    const meds = JSON.parse(localStorage.getItem('medications') || '[]');
    meds.push({ name, dose, time });
    meds.sort((a, b) => a.time.localeCompare(b.time));
    localStorage.setItem('medications', JSON.stringify(meds));
    document.getElementById('input-name').value = '';
    document.getElementById('input-dose').value = '';
    renderMedications();
    alert("保存成功！");
}
function deleteMedication(index) {
    if(confirm("确定删除？")) {
        const meds = JSON.parse(localStorage.getItem('medications') || '[]');
        meds.splice(index, 1);
        localStorage.setItem('medications', JSON.stringify(meds));
        renderMedications();
    }
}

// ================= 2. 引导逻辑 =================
const guideSteps = [
  { icon: "👋", title: "欢迎使用安心提醒", desc: "专为老年人设计的吃药与活动提醒小助手。" },
  { icon: "⏰", title: "按时提醒", desc: "设定时间后，我们会提醒您按时吃药。" },
  { icon: "🧘", title: "活动筋骨", desc: "久坐提醒您起来做八段锦。现在开始体验吧！" }
];
let currentGuideStep = 0;
function updateGuideUI() {
  const step = guideSteps[currentGuideStep];
  document.getElementById('g-icon').innerText = step.icon;
  document.getElementById('g-title').innerText = step.title;
  document.getElementById('g-desc').innerText = step.desc;
  const dotsContainer = document.getElementById('g-dots');
  dotsContainer.innerHTML = '';
  for(let i=0; i<guideSteps.length; i++) {
    let dot = document.createElement('div');
    dot.className = 'guide-dot' + (i === currentGuideStep ? ' active' : '');
    dotsContainer.appendChild(dot);
  }
  document.getElementById('g-btn').innerText = (currentGuideStep === guideSteps.length - 1) ? "开始使用" : "下一步";
}
function nextGuideStep() {
  if(currentGuideStep < guideSteps.length - 1) {
    currentGuideStep++;
    updateGuideUI();
  } else {
    localStorage.setItem('hasSeenGuide', 'true');
    document.getElementById('guide-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    renderMedications();
    startSedentaryTimer(); 
  }
}

// ================= 3. 八段锦与网页原生语音 =================
const bdjSteps = [
    { title: "第一式：双手托天理三焦", icon: "🙆‍♂️", desc: "双手交叉，向上托举。", voice: "第一式，双手托天理三焦。吸气，上托。呼气，下落。" },
    { title: "第二式：左右开弓似射雕", icon: "🏹", desc: "像拉弓一样左右伸展。", voice: "第二式，左右开弓似射雕。扎马步，吸气拉弓。" },
    { title: "第三式：背后七颠百病消", icon: "🧍‍♂️", desc: "脚跟踮起，轻轻震动。", voice: "第三式，背后七颠百病消。吸气踮脚，呼气落地。" }
];
let currentBdjStep = 0;

// 核心：网页原生语音
function playWebSpeech(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // 先停止之前的
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN'; // 中文
        utterance.rate = 0.9;     // 语速稍微放慢
        utterance.volume = 1.0;   // 音量最大
        window.speechSynthesis.speak(utterance);
    } else {
        alert("当前手机不支持网页语音");
    }
}

function startBaduanjin() {
    currentBdjStep = 0;
    updateBdjUI();
    document.getElementById('baduanjin-overlay').style.display = 'flex';
    
    const audio = document.getElementById('bdj-music');
    if (audio) {
        audio.currentTime = 0; 
        audio.volume = 0.3; // 音乐压低
        audio.play().catch(e => console.log("音乐播放失败")); 
    }
    // 延时一下，让音乐先起，再播语音
    setTimeout(() => { playWebSpeech(bdjSteps[currentBdjStep].voice); }, 500);
}

function updateBdjUI() {
    const step = bdjSteps[currentBdjStep];
    document.getElementById('bdj-title').innerText = step.title;
    document.getElementById('bdj-icon').innerText = step.icon;
    document.getElementById('bdj-desc').innerText = step.desc;
    const btn = document.getElementById('bdj-btn');
    btn.innerText = (currentBdjStep === bdjSteps.length - 1) ? "做完了，返回首页" : "下一个动作";
}

function nextBaduanjin() {
    if (currentBdjStep < bdjSteps.length - 1) {
        currentBdjStep++;
        updateBdjUI();
        playWebSpeech(bdjSteps[currentBdjStep].voice); 
    } else {
        closeBaduanjin();
    }
}

function closeBaduanjin() {
    document.getElementById('baduanjin-overlay').style.display = 'none';
    const audio = document.getElementById('bdj-music');
    if (audio) { audio.pause(); audio.currentTime = 0; }
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); }
    startSedentaryTimer(); 
}

// ================= 4. 久坐定时器 =================
const SEDENTARY_TIME = 60 * 1000; // 测试60秒
let sedentaryTimer;
function startSedentaryTimer() {
    clearTimeout(sedentaryTimer);
    sedentaryTimer = setTimeout(() => {
        if (confirm("您已经久坐超过45分钟啦！\n起来活动一下做做八段锦吧？")) {
            startBaduanjin();
        } else {
            startSedentaryTimer(); 
        }
    }, SEDENTARY_TIME);
}

window.addEventListener('load', () => {
    if(localStorage.getItem('hasSeenGuide') === 'true') {
        document.getElementById('guide-overlay').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        renderMedications();
        startSedentaryTimer(); 
    } else {
        updateGuideUI();
    }
});
