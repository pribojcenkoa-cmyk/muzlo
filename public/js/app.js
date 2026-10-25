// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ
// ==========================================
const audioPlayer = document.getElementById('audio-player');
const trackListEl = document.getElementById('track-list');
const pageTitle = document.getElementById('page-title');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const navHome = document.getElementById('nav-home');
const navSearch = document.getElementById('nav-search');
const navLibrary = document.getElementById('nav-library');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');
const seekSlider = document.getElementById('seek-slider');
const volumeSlider = document.getElementById('volume-slider');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authContainer = document.getElementById('auth-container');

let currentTracks = [];
let currentTrackIndex = -1;
let isPlaying = false;
let isLoginMode = true;
let currentTrackRealDuration = 0;

// ==========================================
// 2. УТИЛИТЫ
// ==========================================
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const getValidCover = (url) => url || '/img/default-cover.png';

function getStreamUrl(track) {
  if (track.stream_url) return track.stream_url; 
  if (track.is_external && track.file_url) return track.file_url; 
  return `/api/tracks/${track.id}/stream`;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ==========================================
// 3. СОХРАНЕНИЕ ПЛЕЕРА
// ==========================================
function savePlayerState() {
  if (!audioPlayer.src) return;
  const track = currentTracks[currentTrackIndex];
  if (!track) return;
  localStorage.setItem('muzlo_current_track', JSON.stringify(track));
  localStorage.setItem('muzlo_current_time', audioPlayer.currentTime);
}

async function restorePlayerState() {
  const savedTrackJson = localStorage.getItem('muzlo_current_track');
  const savedTime = parseFloat(localStorage.getItem('muzlo_current_time') || 0);
  if (!savedTrackJson) return;

  try {
    const track = JSON.parse(savedTrackJson);
    document.querySelector('.player')?.classList.remove('hidden');
    playerTitle.textContent = track.title;
    playerArtist.textContent = track.artist_name || 'Неизвестен';
    if (track.cover_url) {
      playerCover.src = track.cover_url;
      playerCover.classList.remove('hidden');
    } else {
      playerCover.classList.add('hidden');
    }
    currentTrackRealDuration = track.duration || 0;
    totalTimeEl.textContent = formatTime(currentTrackRealDuration);
    audioPlayer.src = getStreamUrl(track);
    isPlaying = false;
    btnPlay.textContent = '▶';

    audioPlayer.addEventListener('loadedmetadata', () => {
      if (savedTime > 0 && savedTime < audioPlayer.duration) audioPlayer.currentTime = savedTime;
    }, { once: true });
  } catch (e) {}
}

// ==========================================
// 4. РЕНДЕР ТРЕКОВ
// ==========================================
function renderTracks(tracksArray, isLibrary = false) {
  currentTracks = tracksArray || [];
  trackListEl.innerHTML = '';
  if (currentTracks.length === 0) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ничего не найдено.</p>';
    return;
  }

  currentTracks.forEach((track, index) => {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.index = index;
    const actionBtnHTML = isLibrary 
      ? `<button class="btn-delete" title="Удалить">✕</button>` 
      : `<button class="btn-like" title="Сохранить">♥</button>`;

    div.innerHTML = `
      <img src="${getValidCover(track.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-artist"><span class="artist-link" data-artist="${track.artist_name || 'Неизвестен'}">${track.artist_name || 'Неизвестен'}</span></div>
      </div>
      <div class="track-duration">${formatTime(track.duration)}</div>
      ${actionBtnHTML}
    `;

    div.querySelector('.track-cover').onerror = function() {
      this.onerror = null; 
      this.src = '/img/default-cover.png';
    };

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-like') || e.target.classList.contains('btn-delete') || e.target.classList.contains('artist-link')) return; 
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      currentTrackIndex = index;
      playTrack(track);
    });

    const actionBtn = div.querySelector('.btn-like, .btn-delete');
    if (isLibrary) {
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Удалить этот трек?')) return;
        try {
          const res = await fetch(`/api/library/${track.id}`, { method: 'DELETE' });
          if (res.ok) navLibrary.click();
        } catch (err) {}
      });
    } else {
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const streamUrl = getStreamUrl(track);
          const res = await fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id: String(track.id), title: track.title, artist_name: track.artist_name,
              cover_url: track.cover_url, duration: track.duration, stream_url: streamUrl
            })
          });
          if (res.status === 401) {
            alert('Войдите в аккаунт!'); authModal.classList.add('active'); return;
          }
          if (res.ok) { actionBtn.classList.add('liked'); actionBtn.textContent = '❤'; }
        } catch (err) {}
      });
    }
    trackListEl.appendChild(div);
  });
}

trackListEl.addEventListener('click', (e) => {
  if (e.target.classList.contains('artist-link')) {
    e.stopPropagation();
    loadArtistPage(e.target.dataset.artist);
  }
});

// ==========================================
// 5. СТРАНИЦА АРТИСТА
// ==========================================
async function loadArtistPage(artistName) {
  if (!artistName || artistName === 'Неизвестен') return;
  [navHome, navSearch, navLibrary].forEach(el => el.classList.remove('active'));
  pageTitle.textContent = `Артист: ${artistName}`;
  searchContainer.style.display = 'none';
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  
  try {
    const res = await fetchWithTimeout(`/api/search/artist?name=${encodeURIComponent(artistName)}`);
    const data = await res.json();
    renderTracks(data.tracks);
    const backBtnHTML = `<button id="btn-back-home" style="margin-bottom: 20px; padding: 8px 16px; background: #282828; color: white; border: none; border-radius: 8px; cursor: pointer;">← Назад</button>`;
    trackListEl.insertAdjacentHTML('afterbegin', backBtnHTML);
    document.getElementById('btn-back-home').addEventListener('click', () => navHome.click());
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки.</p>';
  }
}

// ==========================================
// 6. ПЛЕЕР (Аудио запускается МГНОВЕННО)
// ==========================================
function playTrack(track) {
  const playerEl = document.querySelector('.player');
  if (playerEl && playerEl.classList.contains('hidden')) {
    playerEl.classList.remove('hidden');
  }

  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist_name || 'Неизвестен';
  
  if (track.cover_url) {
    playerCover.src = track.cover_url;
    playerCover.classList.remove('hidden');
  } else {
    playerCover.classList.add('hidden');
  }

  currentTrackRealDuration = track.duration || 0;
  totalTimeEl.textContent = formatTime(currentTrackRealDuration);
  seekSlider.value = 0;

  audioPlayer.src = getStreamUrl(track);
  
  audioPlayer.play().then(() => {
    isPlaying = true;
    btnPlay.textContent = '⏸';
    savePlayerState();
  }).catch(err => {
    console.error('Ошибка аудио:', err);
    btnPlay.textContent = '▶';
    isPlaying = false;
  });
}

btnPlay.addEventListener('click', () => {
  if (!audioPlayer.src) return;
  if (isPlaying) {
    audioPlayer.pause();
    btnPlay.textContent = '▶';
    isPlaying = false;
    savePlayerState();
  } else {
    audioPlayer.play();
    btnPlay.textContent = '⏸';
    isPlaying = true;
  }
});

btnNext.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  document.querySelector(`.track-item[data-index="${(currentTrackIndex + 1) % currentTracks.length}"]`)?.click();
});

btnPrev.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  document.querySelector(`.track-item[data-index="${(currentTrackIndex - 1 + currentTracks.length) % currentTracks.length}"]`)?.click();
});

audioPlayer.addEventListener('timeupdate', () => {
  const duration = currentTrackRealDuration || audioPlayer.duration;
  if (!duration || isNaN(duration)) return;
  seekSlider.value = (audioPlayer.currentTime / duration) * 100;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  if (Math.floor(audioPlayer.currentTime) % 3 === 0) savePlayerState();
});

audioPlayer.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(currentTrackRealDuration || audioPlayer.duration);
});

seekSlider.addEventListener('change', () => {
  const duration = currentTrackRealDuration || audioPlayer.duration;
  if (!duration) return;
  audioPlayer.currentTime = (seekSlider.value / 100) * duration;
  savePlayerState();
});

volumeSlider.addEventListener('input', () => audioPlayer.volume = volumeSlider.value);

audioPlayer.addEventListener('ended', () => {
  localStorage.removeItem('muzlo_current_track');
  localStorage.removeItem('muzlo_current_time');
  btnNext.click();
});

window.addEventListener('beforeunload', savePlayerState);

// ==========================================
// 7. НАВИГАЦИЯ И АВТОРИЗАЦИЯ
// ==========================================
function switchTab(activeTab, title, showSearch = false) {
  [navHome, navSearch, navLibrary].forEach(el => el.classList.remove('active'));
  if (activeTab) activeTab.classList.add('active');
  pageTitle.textContent = title;
  searchContainer.style.display = showSearch ? 'block' : 'none';
}

navHome.addEventListener('click', async () => {
  switchTab(navHome, 'Рекомендации');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  try {
    const res = await fetchWithTimeout('/api/search/trending');
    const data = await res.json();
    renderTracks(data.tracks);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Сервер не отвечает.</p>';
  }
});

navSearch.addEventListener('click', () => {
  switchTab(navSearch, 'Поиск по миру', true);
  searchInput.focus();
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите название...</p>';
});

let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  if (query.length < 2) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите хотя бы 2 символа</p>';
    return;
  }
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ищем музыку...</p>';
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      renderTracks(data.tracks);
    } catch (err) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка поиска.</p>';
    }
  }, 600);
});

navLibrary.addEventListener('click', async () => {
  switchTab(navLibrary, 'Моя медиатека');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  try {
    const res = await fetchWithTimeout('/api/library');
    if (res.status === 401) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Войдите в аккаунт.</p>';
      return;
    }
    const data = await res.json();
    renderTracks(data.tracks, true);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки.</p>';
  }
});

authContainer.addEventListener('click', (e) => {
  if (e.target.id === 'btn-open-auth') authModal.classList.add('active');
  if (e.target.id === 'btn-logout') logout();
});

function updateAuthUI(user) {
  if (user) {
    authContainer.innerHTML = `<div class="profile-info"><span>👤 ${user.email}</span><button class="btn-logout" id="btn-logout">Выйти</button></div>`;
  } else {
    authContainer.innerHTML = `<button class="btn-auth" id="btn-open-auth">Войти</button>`;
  }
}

document.getElementById('btn-close-auth').addEventListener('click', () => authModal.classList.remove('active'));
document.getElementById('btn-toggle-auth').addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  document.getElementById('modal-title').textContent = isLoginMode ? 'Вход' : 'Регистрация';
  document.getElementById('btn-submit-auth').textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
  document.getElementById('auth-toggle-text').textContent = isLoginMode ? 'Нет аккаунта?' : 'Уже есть аккаунт?';
  document.getElementById('btn-toggle-auth').textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    authModal.classList.remove('active');
    updateAuthUI(data.user);
    authForm.reset();
    if (navLibrary.classList.contains('active')) navLibrary.click();
  } catch (err) { alert(err.message); }
});

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  updateAuthUI(null);
  navHome.click();
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      updateAuthUI(data.user);
    }
  } catch (err) {}
}

// ==========================================
// 8. СТАРТ
// ==========================================
checkAuth();
restorePlayerState(); 
navHome.click(); 