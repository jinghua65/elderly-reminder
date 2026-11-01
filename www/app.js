// ================= 1. 首屏引导逻辑 =================
const guideSteps = [
  { icon: "👋", title: "欢迎使用安心提醒", desc: "这是专为老年人设计的吃药与活动提醒小助手。" },
  { icon: "⏰", title: "按时提醒", desc: "设定时间后，我们会用大字和声音提醒您按时吃药。" },
  { icon: "🆘", title: "紧急联系", desc: "遇到特殊情况，一键联系家人或医生。现在开始体验吧！" }
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

  if(currentGuideStep === guideSteps.length - 1) {
    document.getElementById('g-btn').innerText = "开始使用";
  } else {
    document.getElementById('g-btn').innerText = "下一步";
  }
}

function nextGuideStep() {
  if(currentGuideStep < guideSteps.length - 1) {
    currentGuideStep++;
    updateGuideUI();
  } else {
    localStorage.setItem('hasSeenGuide', 'true');
    const overlay = document.getElementById('guide-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => { 
        overlay.style.display = 'none'; 
        const content = document.getElementById('app-content');
        if(content) content.style.display = 'block';
    }, 500);
    startSedentaryTimer(); 
  }
}

// ================= 2. 八段锦逻辑 =================
const bdjSteps = [
    { title: "第一式：双手托天理三焦", icon: "🙆‍♂️", desc: "双手交叉，向上托举，拉伸腰背。慢慢吸气，慢慢呼气。" },
    { title: "第二式：左右开弓似射雕", icon: "🏹", desc: "双脚分开，像拉弓一样左右伸展，帮助活动肩颈。" },
    { title: "第三式：背后七颠百病消", icon: "🧍‍♂️", desc: "双脚并拢，脚跟踮起，轻轻震动身体，放松全身。" }
];
let currentBdjStep = 0;

function startBaduanjin() {
    currentBdjStep = 0;
    updateBdjUI();
    const bdjOverlay = document.getElementById('baduanjin-overlay');
    if(bdjOverlay) bdjOverlay.style.display = 'flex';
    
    const audio = document.getElementById('bdj-music');
    if (audio) {
        audio.currentTime = 0; 
        audio.play().catch(e => console.log("播放失败:", e)); 
    }
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
    } else {
        closeBaduanjin();
    }
}

function closeBaduanjin() {
    const bdjOverlay = document.getElementById('baduanjin-overlay');
    if(bdjOverlay) bdjOverlay.style.display = 'none';
    
    const audio = document.getElementById('bdj-music');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
    startSedentaryTimer(); 
}

// ================= 3. 久坐定时器逻辑 =================
// 测试用60秒后提醒。正式上线请改为 45 * 60 * 1000
const SEDENTARY_TIME = 60 * 1000; 
let sedentaryTimer;

function startSedentaryTimer() {
    clearTimeout(sedentaryTimer);
    sedentaryTimer = setTimeout(() => {
        const wantToExercise = confirm("您已经久坐超过45分钟啦！\n起来活动一下，做做八段锦吧？");
        if (wantToExercise) {
            startBaduanjin();
        } else {
            startSedentaryTimer(); 
        }
    }, SEDENTARY_TIME);
}

// ================= 4. 页面加载初始化 =================
window.addEventListener('load', () => {
    if(localStorage.getItem('hasSeenGuide') === 'true') {
        const guideOverlay = document.getElementById('guide-overlay');
        if(guideOverlay) guideOverlay.style.display = 'none';
        const content = document.getElementById('app-content');
        if(content) content.style.display = 'block';
        startSedentaryTimer(); 
    } else {
        updateGuideUI();
    }
});
