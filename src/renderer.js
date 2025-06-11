// const { ipcRenderer } = require('electron'); // This is not needed with contextBridge
// const { NetworkManager } = require('./network-manager'); // This is not needed with contextBridge

// UI Elements
const messageDisplay = document.getElementById('message-display');
const messageEntry = document.getElementById('message-entry');
const sendBtn = document.getElementById('send-btn');
const nicknameEntry = document.getElementById('nickname-entry');
const startBtn = document.getElementById('start-btn');
const peersListbox = document.getElementById('peers-listbox');
const eduText = document.getElementById('edu-text');

// Window control button event listeners
document.getElementById("min-btn").addEventListener("click", () => {
  window.electronAPI.minimize();
});

document.getElementById("max-btn").addEventListener("click", () => {
  window.electronAPI.maximize();
});

document.getElementById("close-btn").addEventListener("click", () => {
  window.electronAPI.close();
});

// Statistics labels
const statsLabels = {
  'Status': document.getElementById('status-label'),
  'Local IP': document.getElementById('local-ip-label'),
  'UDP Port': document.getElementById('udp-port-label'),
  'TCP Port': document.getElementById('tcp-port-label'),
  'Messages Sent': document.getElementById('messages-sent-label'),
  'Messages Received': document.getElementById('messages-received-label'),
  'Peers Discovered': document.getElementById('peers-discovered-label'),
  'Session Duration': document.getElementById('session-duration-label')
};

// No longer need a global networkManager instance here

// Event listeners
messageEntry.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);
startBtn.addEventListener('click', startP2P);

// Initialize educational content
function initializeEducationalContent() {
  const content = `🔹 P2P_EchoVoid:
- Uses both TCP and UDP protocols
- UDP for peer discovery (broadcast)
- TCP for reliable messaging

🔹 TCP (Transmission Control Protocol):
- Connection-oriented protocol
- Reliable, ordered delivery
- Error checking and retransmission
- Perfect for chat applications

🔹 UDP (User Datagram Protocol):
- Connectionless protocol
- Used for peer discovery broadcasts
- Fast but less reliable than TCP

🔹 Socket Programming:
- Enables network communication
- Uses IP addresses and ports
- Allows data exchange between peers

🔹 IPv4 Addressing:
- Format: xxx.xxx.xxx.xxx
- Each number: 0-255
- Used to identify devices on network

Enter your agent alias and click 'Start' to join the P2P network!`;

  eduText.textContent = content;
}

// Start P2P networking by calling the main process
async function startP2P() {
  const nickname = nicknameEntry.value.trim();
  if (!nickname) {
    displaySystemMessage('Error: Please enter a nickname');
    return;
  }
  
  const success = await window.electronAPI.startP2P(nickname);

  if (success) {
    // Disable nickname entry and start button
    nicknameEntry.disabled = true;
    startBtn.disabled = true;

    // Enable message entry and send button
    messageEntry.disabled = false;
    sendBtn.disabled = false;

    // Start statistics update
    startStatisticsUpdate();
  } else {
    displaySystemMessage('Error: Failed to start P2P networking');
  }
}

// Send message to selected peers via the main process
function sendMessage() {
  // Check if networking has started by checking if the start button is disabled
  if (startBtn.disabled) {
    const message = messageEntry.value.trim();
    if (message) {
      // Get all peer IPs from the listbox
      const allOptions = Array.from(peersListbox.options);
      const allPeers = allOptions.map(option => {
        const peerEntry = option.text;
        const ipStart = peerEntry.lastIndexOf('(') + 1;
        const ipEnd = peerEntry.lastIndexOf(')');
        if (ipStart > 0 && ipEnd > ipStart) {
          return peerEntry.substring(ipStart, ipEnd);
        }
        return null;
      }).filter(ip => ip !== null);

      // Send message to all peers via main process
      window.electronAPI.sendMessage({ selectedPeers: allPeers, message });

      // Display our own message immediately
      displayMessage(new Date().toLocaleTimeString(), 'You', 'local', message);

      // Clear message entry
      messageEntry.value = '';
    }
  } else {
    displaySystemMessage('Please start the chat first!');
  }
}

// Update peers list in UI
function updatePeersList(peers) {
  // Clear current list
  peersListbox.innerHTML = '';

  // Add each peer
  for (const [ip, info] of Object.entries(peers)) {
    const nickname = info.nickname || 'Unknown';
    const option = document.createElement('option');
    option.text = `${nickname} (${ip})`;
    option.value = ip;
    option.selected = true; // Select all options by default
    peersListbox.add(option);
  }

  // Ensure all options are selected by default
  Array.from(peersListbox.options).forEach(option => option.selected = true);
}

// Display a message in the chat window
function displayMessage(timestamp, sender, senderIp, message) {
  const messageElement = document.createElement('div');
  messageElement.id = `messageElement`;
  messageElement.style.display = 'flex';
  messageElement.style.flexDirection = 'column';


  const senderElement = document.createElement('strong');
  senderElement.textContent = `${sender}\t`;

  const timeElement = document.createElement('div');
  timeElement.textContent = `${timestamp}`;
  timeElement.style.alignSelf = 'flex-end';

  const messageText = document.createTextNode(` ${message}`);

  // Append sender and message to the messageElement
  messageElement.appendChild(senderElement);
  messageElement.appendChild(messageText);
  messageElement.appendChild(timeElement);

  if (sender === "You") {
    messageElement.style.alignSelf = 'flex-end';
  } else {
    messageElement.style.alignSelf = 'flex-start';
  }
  Object.assign(messageElement.style, {
    backgroundColor: '#000000',
    color: '#6ef8de',
    padding: '5px',
    borderRadius: '5px',
    border: '2px solid #6ef8de',
    marginBottom: '5px',
    minWidth: '100px',
    width: 'fit-content',
  });
  messageDisplay.appendChild(messageElement);
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

// Display a system message in the chat window
function displaySystemMessage(message) {
  const timestamp = new Date().toLocaleTimeString();
  const messageElement = document.createElement('div');
  messageElement.textContent = message;
  Object.assign(messageElement.style, {
    backgroundColor:'#000000',
    color:'#6ef8de',
    padding:'5px',
    borderRadius:'5px', 
    border: '1px solid #6ef8de',
    marginBottom: '5px',
    width: 'fit-content',
    alignSelf: 'center',
  });
  messageDisplay.appendChild(messageElement);
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

// Update statistics in the UI by fetching from the main process
function startStatisticsUpdate() {
  setInterval(async () => {
    if (startBtn.disabled) {
      const stats = await window.electronAPI.getStats();
      if (stats) {
        statsLabels['Status'].textContent = stats.status;
        statsLabels['Local IP'].textContent = stats.localIp;
        statsLabels['UDP Port'].textContent = stats.udpPort;
        statsLabels['TCP Port'].textContent = stats.tcpPort;
        statsLabels['Messages Sent'].textContent = stats.messagesSent;
        statsLabels['Messages Received'].textContent = stats.messagesReceived;
        statsLabels['Peers Discovered'].textContent = stats.peersDiscovered;
        statsLabels['Session Duration'].textContent = stats.sessionDuration;
      }
    }
  }, 1000);
}

// This function is no longer needed as the logic is in main.js
// function startInactivePeersCheck() { ... }

// Initialize app and set up listeners for events from the main process
function initialize() {
  // Set up listeners
  window.electronAPI.onMessageReceived(displayMessage);
  window.electronAPI.onPeersUpdated(updatePeersList);
  window.electronAPI.onSystemLog(displaySystemMessage);

  // Display welcome message
  displaySystemMessage('You have joined P2P_EchoVoid');
  displaySystemMessage('Enter your agent alias and click \'Start\' to join the P2P network.');

  // Initialize educational content
  initializeEducationalContent();
}

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
