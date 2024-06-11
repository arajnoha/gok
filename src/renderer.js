const { ipcRenderer } = require('electron');
const path = require('path');

let musicLibrary = {};
let playQueue = [];
let currentTrackIndex = 0;
let sound = null;
let paused = false;

const libraryArtists = document.getElementById('library-artists');
const libraryAlbums = document.getElementById('library-albums');
const librarySongs = document.getElementById('library-songs');

ipcRenderer.on('music-library', (event, library) => {
    musicLibrary = library;
    updateLibraryDisplay();
});

document.getElementById('import-music').addEventListener('click', async () => {
    const updatedLibrary = await ipcRenderer.invoke('import-music');
    if (Object.keys(updatedLibrary).length > 0) {
        musicLibrary = updatedLibrary;
        updateLibraryDisplay();
        ipcRenderer.send('update-music-library', musicLibrary); // Update the library on the main process
    }
});

document.getElementById('play').addEventListener('click', () => playMusic(false));
document.getElementById('pause').addEventListener('click', pauseMusic);
document.getElementById('stop').addEventListener('click', stopMusic);
document.getElementById('next').addEventListener('click', nextTrack);
document.getElementById('prev').addEventListener('click', previousTrack);
document.getElementById('progress-container').addEventListener('click', setProgress);
document.getElementById('library-artists').addEventListener('click', manageHighlight);
document.getElementById('contact').addEventListener('click', () => document.getElementById('dialog').showModal());
document.getElementById('close-dialog').addEventListener('click', () => document.getElementById('dialog').close());

function updateLibraryDisplay() {
    libraryArtists.innerHTML = Object.keys(musicLibrary).map(artist => `
        <div class="artist" onclick="showAlbums('${artist}')">${artist}</div>
    `).join('');
}

function showAlbums(artist) {
    const albumsHtml = Object.entries(musicLibrary[artist]).map(([album, albumData], index) => {
        const albumArt = albumData.artwork || 'album-placeholder.png';
        return `
            <div class="album ${index === 0 ? 'highlight' : ''}" id="album-${artist}-${album}" onclick="showSongs('${artist}', '${album}', ${index})">
                <button onclick="playAllAlbumSongs('${artist}', '${album}')">Play Album</button>
                <img src="${albumArt}" alt="Album Art">
                <h4>${album}</h4>
                <div id="songs-${artist}-${album}"></div>
            </div>
        `;
    }).join('');

    libraryAlbums.innerHTML = albumsHtml;
    if (Object.keys(musicLibrary[artist]).length > 0) {
        const firstAlbum = Object.keys(musicLibrary[artist])[0];
        showSongs(artist, firstAlbum, 0);
    }
}

function showSongs(artist, album, albumIndex) {
    // Highlight the selected album
    document.querySelectorAll('.album').forEach(albumDiv => {
        albumDiv.classList.remove('highlight');
    });
    document.getElementById(`album-${artist}-${album}`).classList.add('highlight');

    librarySongs.innerHTML = musicLibrary[artist][album].songs.map((song, index) => {
        return `<div class="song ${playQueue.length > 0 && playQueue[currentTrackIndex] && playQueue[currentTrackIndex].title === song.title ? 'current' : ''}" onclick="playAlbumFromSong('${artist}', '${album}', ${index})">${song.title}<span class="time">${formatTime(song.duration)}</span></div>`;
    }).join('');
}


function manageHighlight(event) {
  if (event.target.closest(".artist")) {
    if (document.querySelector(".artist.highlight")) {
      document.querySelector(".artist.highlight").classList.remove("highlight");
    }
    event.target.closest(".artist").classList.add("highlight");
  }
}

function playAllAlbumSongs(artist, album) {
    playQueue = musicLibrary[artist][album].songs.map(song => ({ file: song.file, title: song.title }));
    currentTrackIndex = 0;
    updateQueueDisplay();
    playMusic(true); // Start playing immediately
    highlightCurrentTrack(); // Highlight the current track
}

function playAlbumFromSong(artist, album, index) {
    playQueue = musicLibrary[artist][album].songs.map(song => ({ file: song.file, title: song.title }));
    currentTrackIndex = index;
    updateQueueDisplay();
    playMusic(true); // Start playing immediately
    highlightCurrentTrack(); // Highlight the current track
}

function updateQueueDisplay() {
    const queueDiv = document.getElementById('queue');
    queueDiv.innerHTML = playQueue.map((song, index) => `
        <div>${path.basename(song.file)}</div>
    `).join('');
}

function playMusic(forcePlay = false) {
    if (playQueue.length > 0) {
        if (sound && !forcePlay && paused) {
            sound.play();
            paused = false;
        } else {
            if (sound) {
                sound.stop();
            }
            sound = new window.Howl({
                src: [playQueue[currentTrackIndex].file],
                html5: true,
                onend: nextTrack,
                onplay: updateProgress,
                onload: updateTotalTime,
            });
            sound.play();
            console.log(playQueue)
            document.getElementById('current-track').innerText = playQueue[currentTrackIndex].title;
            highlightCurrentTrack(); // Call to highlight the current track
        }
    }
}


function pauseMusic() {
    if (sound) {
        sound.pause();
        paused = true;
    }
}

function stopMusic() {
    if (sound) {
        sound.stop();
        paused = false;
    }
}

function nextTrack() {
    if (currentTrackIndex < playQueue.length - 1) {
        currentTrackIndex++;
        playMusic(true);
        highlightCurrentTrack(); // Call to highlight the current track
    }
}

function previousTrack() {
    if (currentTrackIndex > 0) {
        currentTrackIndex--;
        playMusic(true);
        highlightCurrentTrack(); // Call to highlight the current track
    }
}

function updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const currentTime = document.getElementById('current-time');
    const totalTime = document.getElementById('total-time');

    requestAnimationFrame(function () {
        const seek = sound.seek() || 0;
        progressBar.style.width = ((seek / sound.duration()) * 100) + '%';
        currentTime.innerText = formatTime(Math.round(seek));
        if (sound.playing()) {
            requestAnimationFrame(updateProgress);
        }
    });
}

function updateTotalTime() {
  const totalTime = document.getElementById('total-time');
  if (sound && !isNaN(sound.duration())) { // Check if duration is a valid number
      totalTime.innerText = formatTime(Math.round(sound.duration()));
  } else {
      totalTime.innerText = "0:00"; // Set default value if duration is not valid
  }
}

function highlightCurrentTrack() {
    document.querySelectorAll('.song').forEach((songDiv, index) => {
        songDiv.classList.toggle('current', index === currentTrackIndex);
    });
}

function setProgress(e) {
    if (sound) {
        const progressContainer = document.getElementById('progress-container');
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        const duration = sound.duration();
        sound.seek((clickX / width) * duration);
        updateProgress();
    }
}

function formatTime(seconds) {
    if (!isNaN(seconds) && seconds > 0) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    } else {
        return "0:00"; // Default value for invalid duration
    }
}
