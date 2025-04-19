/*

  Constants

*/

var PREFS = null,
BADGE_BACKGROUND_COLORS = {
  work: [192, 0, 0, 255],
  break: [0, 192, 0, 255]
}, 
// We can't use Audio API in a service worker, so we'll use a different approach
// for playing sounds
ringLoaded = false;

// Load preferences first
loadPrefs().then(() => {
  console.log('Preferences loaded');
});

function defaultPrefs() {
  return {
    siteList: [
      'facebook.com',
      'youtube.com',
      'twitter.com',
      'tumblr.com',
      'pinterest.com',
      'myspace.com',
      'livejournal.com',
      'digg.com',
      'stumbleupon.com',
      'reddit.com',
      'kongregate.com',
      'newgrounds.com',
      'addictinggames.com',
      'hulu.com'
    ],
    durations: { // in seconds
      work: 25 * 60,
      break: 5 * 60
    },
    shouldRing: true,
    clickRestarts: false,
    whitelist: false,
    showNotifications: true
  }
}

async function loadPrefs() {
  return new Promise((resolve) => {
    chrome.storage.local.get('prefs', (result) => {
      if(result.prefs) {
        PREFS = updatePrefsFormat(result.prefs);
        resolve(PREFS);
      } else {
        savePrefs(defaultPrefs()).then(prefs => {
          PREFS = prefs;
          resolve(PREFS);
        });
      }
    });
  });
}

function updatePrefsFormat(prefs) {
  // Sometimes we need to change the format of the PREFS module. When just,
  // say, adding boolean flags with false as the default, there's no
  // compatibility issue. However, in more complicated situations, we need
  // to modify an old PREFS module's structure for compatibility.
  
  if(prefs.hasOwnProperty('domainBlacklist')) {
    // Upon adding the whitelist feature, the domainBlacklist property was
    // renamed to siteList for clarity.
    
    prefs.siteList = prefs.domainBlacklist;
    delete prefs.domainBlacklist;
    savePrefs(prefs);
    console.log("Renamed PREFS.domainBlacklist to PREFS.siteList");
  }
  
  if(!prefs.hasOwnProperty('showNotifications')) {
    // Upon adding the option to disable notifications, added the
    // showNotifications property, which defaults to true.
    prefs.showNotifications = true;
    savePrefs(prefs);
    console.log("Added PREFS.showNotifications");
  }
  
  return prefs;
}

async function savePrefs(prefs) {
  return new Promise((resolve) => {
    chrome.storage.local.set({prefs: prefs}, () => {
      resolve(prefs);
    });
  });
}

async function setPrefs(prefs) {
  PREFS = await savePrefs(prefs);
  return prefs;
}

// Function to play sound by creating a new tab that plays the sound
function playSound() {
  if (PREFS && PREFS.shouldRing) {
    // We'll create a notification tab that plays the sound and then closes itself
    chrome.tabs.create({
      url: chrome.runtime.getURL('play-sound.html'),
      active: false
    }, tab => {
      // Tab will self-close after playing sound
    });
  }
}

var ICONS = {
  ACTION: {
    CURRENT: {},
    PENDING: {}
  },
  FULL: {},
}, iconTypeS = ['default', 'work', 'break'],
  iconType;
for(var i in iconTypeS) {
  iconType = iconTypeS[i];
  ICONS.ACTION.CURRENT[iconType] = "icons/" + iconType + ".png";
  ICONS.ACTION.PENDING[iconType] = "icons/" + iconType + "_pending.png";
  ICONS.FULL[iconType] = "icons/" + iconType + "_full.png";
}

/*

  Models

*/

function Pomodoro(options) {
  this.mostRecentMode = 'break';
  this.nextMode = 'work';
  this.running = false;

  this.onTimerEnd = function (timer) {
    this.running = false;
  }

  this.start = function () {
    var mostRecentMode = this.mostRecentMode, timerOptions = {};
    this.mostRecentMode = this.nextMode;
    this.nextMode = mostRecentMode;

    for(var key in options.timer) {
      timerOptions[key] = options.timer[key];
    }
    timerOptions.type = this.mostRecentMode;
    timerOptions.duration = options.getDurations()[this.mostRecentMode];
    this.running = true;
    this.currentTimer = new Pomodoro.Timer(this, timerOptions);
    this.currentTimer.start();
  }
  
  this.restart = function () {
      if(this.currentTimer) {
          this.currentTimer.restart();
      }
  }
}

Pomodoro.Timer = function Timer(pomodoro, options) {
  var tickInterval, timer = this;
  this.pomodoro = pomodoro;
  this.timeRemaining = options.duration;
  this.type = options.type;

  this.start = function () {
    tickInterval = setInterval(tick, 1000);
    options.onStart(timer);
    options.onTick(timer);
  }
  
  this.restart = function() {
      this.timeRemaining = options.duration;
      options.onTick(timer);
  }

  this.timeRemainingString = function () {
    if(this.timeRemaining >= 60) {
      return Math.round(this.timeRemaining / 60) + "m";
    } else {
      return (this.timeRemaining % 60) + "s";
    }
  }

  function tick() {
    timer.timeRemaining--;
    options.onTick(timer);
    if(timer.timeRemaining <= 0) {
      clearInterval(tickInterval);
      pomodoro.onTimerEnd(timer);
      options.onEnd(timer);
    }
  }
}

/*

  Views

*/

// The code gets really cluttered down here. Refactor would be in order,
// but I'm busier with other projects >_<

function locationsMatch(location, listedPattern) {
  return domainsMatch(location.domain, listedPattern.domain) &&
    pathsMatch(location.path, listedPattern.path);
}

function parseLocation(location) {
  var components = location.split('/');
  return {domain: components.shift(), path: components.join('/')};
}

function pathsMatch(test, against) {
  /*
    index.php ~> [null]: pass
    index.php ~> index: pass
    index.php ~> index.php: pass
    index.php ~> index.phpa: fail
    /path/to/location ~> /path/to: pass
    /path/to ~> /path/to: pass
    /path/to/ ~> /path/to/location: fail
  */

  return !against || test.substr(0, against.length) == against;
}

function domainsMatch(test, against) {
  /*
    google.com ~> google.com: case 1, pass
    www.google.com ~> google.com: case 3, pass
    google.com ~> www.google.com: case 2, fail
    google.com ~> yahoo.com: case 3, fail
    yahoo.com ~> google.com: case 2, fail
    bit.ly ~> goo.gl: case 2, fail
    mail.com ~> gmail.com: case 2, fail
    gmail.com ~> mail.com: case 3, fail
  */

  // Case 1: if the two strings match, pass
  if(test === against) {
    return true;
  } else {
    var testFrom = test.length - against.length - 1;

    // Case 2: if the second string is longer than first, or they are the same
    // length and do not match (as indicated by case 1 failing), fail
    if(testFrom < 0) {
      return false;
    } else {
      // Case 3: if and only if the first string is longer than the second and
      // the first string ends with a period followed by the second string,
      // pass
      return test.substr(testFrom) === '.' + against;
    }
  }
}

function isLocationBlocked(location) {
  for(var k in PREFS.siteList) {
    listedPattern = parseLocation(PREFS.siteList[k]);
    if(locationsMatch(location, listedPattern)) {
      // If we're in a whitelist, a matched location is not blocked => false
      // If we're in a blacklist, a matched location is blocked => true
      return !PREFS.whitelist;
    }
  }
  
  // If we're in a whitelist, an unmatched location is blocked => true
  // If we're in a blacklist, an unmatched location is not blocked => false
  return PREFS.whitelist;
}

function executeInTabIfBlocked(action, tab) {
  var file = "content_scripts/" + action + ".js", location;
  location = tab.url.split('://');
  
  // Skip if URL doesn't have the expected format
  if (location.length < 2) return;
  
  location = parseLocation(location[1]);
  
  if(isLocationBlocked(location)) {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: [file]
    });
  }
}

function executeInAllBlockedTabs(action) {
  chrome.tabs.query({}, function (tabs) {
    for(var j in tabs) {
      executeInTabIfBlocked(action, tabs[j]);
    }
  });
}

var notification, mainPomodoro = new Pomodoro({
  getDurations: function () { return PREFS.durations },
  timer: {
    onEnd: function (timer) {
      chrome.action.setIcon({
        path: ICONS.ACTION.PENDING[timer.pomodoro.nextMode]
      });
      chrome.action.setBadgeText({text: ''});
      
      if(PREFS.showNotifications) {
        var nextModeName = chrome.i18n.getMessage(timer.pomodoro.nextMode);
        chrome.notifications.create("", {
          type: "basic",
          title: chrome.i18n.getMessage("timer_end_notification_header"),
          message: chrome.i18n.getMessage("timer_end_notification_body",
                                          nextModeName),
          priority: 2,
          iconUrl: ICONS.FULL[timer.type]
        }, function() {});
      }
      
      if(PREFS.shouldRing) {
        console.log("playing ring");
        playSound();
      }
    },
    onStart: function (timer) {
      chrome.action.setIcon({
        path: ICONS.ACTION.CURRENT[timer.type]
      });
      chrome.action.setBadgeBackgroundColor({
        color: BADGE_BACKGROUND_COLORS[timer.type]
      });
      if(timer.type == 'work') {
        executeInAllBlockedTabs('block');
      } else {
        executeInAllBlockedTabs('unblock');
      }
    },
    onTick: function (timer) {
      chrome.action.setBadgeText({text: timer.timeRemainingString()});
    }
  }
});

chrome.action.onClicked.addListener(function (tab) {
  if(mainPomodoro.running) { 
      if(PREFS.clickRestarts) {
          mainPomodoro.restart();
      }
  } else {
      mainPomodoro.start();
  }
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if(mainPomodoro.mostRecentMode == 'work') {
    executeInTabIfBlocked('block', tab);
  }
});

chrome.notifications.onClicked.addListener(function (id) {
  // Clicking the notification brings you back to Chrome, in whatever window
  // you were last using.
  chrome.windows.getLastFocused(function (window) {
    chrome.windows.update(window.id, {focused: true});
  });
});

// Add listener for messages from options page
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updatePrefs") {
    setPrefs(request.prefs);
  }
});

// Update status in storage whenever the pomodoro status changes
function updatePomodoroStatus() {
  const status = {
    running: mainPomodoro.running,
    mostRecentMode: mainPomodoro.mostRecentMode,
    nextMode: mainPomodoro.nextMode
  };
  
  chrome.storage.local.set({pomodoroStatus: status});
  
  // Check if runtime is available (service worker might be terminating)
  if (chrome.runtime && chrome.runtime.id) {
    // Broadcast the status to any open options pages
    try {
      chrome.runtime.sendMessage({
        action: "pomodoroUpdate",
        status: status
      }, function(response) {
        // Handle response if needed (or ignore runtime errors with empty callback)
      });
    } catch (error) {
      // Suppress the "Receiving end does not exist" error
      // This happens normally when no options pages are open
      console.log("No receivers for status update, this is normal");
    }
  }
}

// Add status tracking to the pomodoro object
const originalStart = mainPomodoro.start;
mainPomodoro.start = function() {
  originalStart.apply(this, arguments);
  updatePomodoroStatus();
};

const originalRestart = mainPomodoro.restart;
mainPomodoro.restart = function() {
  originalRestart.apply(this, arguments);
  updatePomodoroStatus();
};

const originalOnTimerEnd = mainPomodoro.onTimerEnd;
mainPomodoro.onTimerEnd = function(timer) {
  originalOnTimerEnd.apply(this, arguments);
  updatePomodoroStatus();
};
