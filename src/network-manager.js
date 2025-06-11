const dgram = require('dgram');
const net = require('net');
const os = require('os');
const { exec } = require('child_process');
const ip = require('ip');

class NetworkManager {
  constructor() {
    // User identification
    this.nickname = 'Unknown';
    
    // Initialize network variables
    this.udpSocket = null;
    this.tcpServer = null;
    this.running = false;
    this.bytesSent = 0;
    this.bytesReceived = 0;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.startTime = Date.now();
    
    // Network configuration
    this.UDP_PORT = 41234; // For peer discovery
    this.TCP_PORT = 41235; // For messaging
    this.localIp = this.getWifiIp();
    
    // Peer tracking
    this.peers = {}; // {ip: {'nickname': name, 'port': port, 'lastSeen': timestamp}}
    
    // Callbacks for UI updates
    this.onMessageReceived = null;
    this.onPeersUpdated = null;
    this.onSystemLog = null;
  }
  
  // Set callbacks for UI updates
  setCallbacks(callbacks) {
    this.onMessageReceived = callbacks.onMessageReceived;
    this.onPeersUpdated = callbacks.onPeersUpdated;
    this.onSystemLog = callbacks.onSystemLog;
  }
  
  getWifiIp() {
    try {
      const interfaces = os.networkInterfaces();
      
      // Look for WiFi interfaces
      for (const [name, netInterface] of Object.entries(interfaces)) {
        if (name.includes('Wi-Fi') || name.includes('Wireless') || name.includes('wlan')) {
          for (const iface of netInterface) {
            if (iface.family === 'IPv4') {
              const ipAddr = iface.address;
              if (ipAddr.startsWith('192.168.') || ipAddr.startsWith('10.')) {
                return ipAddr;
              }
            }
          }
        }
      }
      
      // Fallback to any IP in the required range
      for (const netInterface of Object.values(interfaces)) {
        for (const iface of netInterface) {
          if (iface.family === 'IPv4') {
            const ipAddr = iface.address;
            if (ipAddr.startsWith('192.168.') || ipAddr.startsWith('10.')) {
              return ipAddr;
            }
          }
        }
      }
      
      return '127.0.0.1'; // Fallback to localhost if no suitable IP found
    } catch (error) {
      // In a production build, we don't want to log this to the console.
      // We'll just return the fallback IP.
      return '127.0.0.1';
    }
  }
  
  configureFirewall(udpPort, tcpPort) {
    if (process.platform === 'win32') {
      try {
        // Add UDP rule for peer discovery
        const udpCmd = `netsh advfirewall firewall add rule name="P2P Chat UDP Discovery" protocol=UDP dir=in localport=${udpPort} action=allow`;
        exec(udpCmd);
        
        // Add TCP rule for messaging
        const tcpCmd = `netsh advfirewall firewall add rule name="P2P Chat TCP Messaging" protocol=TCP dir=in localport=${tcpPort} action=allow`;
        exec(tcpCmd);
        
        return true;
      } catch (error) {
        this.logMessage(`Failed to configure firewall: ${error.message}`);
        return false;
      }
    }
    return true; // For non-Windows systems, assume it's ok
  }
  
  startNetworking() {
    try {
      // Configure firewall
      this.configureFirewall(this.UDP_PORT, this.TCP_PORT);
      
      // Start UDP discovery
      this.udpSocket = dgram.createSocket('udp4');
      this.udpSocket.bind(this.UDP_PORT, this.localIp, () => {
        this.udpSocket.setBroadcast(true);
      });
      
      // Start TCP server
      this.tcpServer = net.createServer();
      this.tcpServer.listen(this.TCP_PORT, this.localIp);
      
      this.running = true;
      
      // Start UDP discovery
      this.startUdpDiscovery();
      
      // Start UDP listener
      this.startUdpListener();
      
      // Start TCP server
      this.startTcpServer();
      
      // Log startup information
      this.logMessage(`Connection to the Void started on ${this.localIp}`);
      this.logMessage(`UDP Discovery: Port ${this.UDP_PORT}`);
      this.logMessage(`TCP Messaging: Port ${this.TCP_PORT}`);
      this.logMessage(`Your agent alias: ${this.nickname}`);
      this.logMessage('Discovering agents...');
      
      return true;
    } catch (error) {
      this.logMessage(`Failed to start networking: ${error.message}`);
      return false;
    }
  }
  
  startUdpDiscovery() {
    // Periodically broadcast presence to network
    this.discoveryInterval = setInterval(() => {
      try {
        // Create discovery packet
        const discoveryData = {
          type: 'discovery',
          nickname: this.nickname,
          tcpPort: this.TCP_PORT
        };
        
        // Broadcast to network
        const message = Buffer.from(JSON.stringify(discoveryData));
        this.udpSocket.send(message, 0, message.length, this.UDP_PORT, '255.255.255.255');
      } catch (error) {
        this.logMessage(`Discovery broadcast error: ${error.message}`);
      }
    }, 5000); // Broadcast every 5 seconds
  }
  
  startUdpListener() {
    // Listen for peer discovery broadcasts
    this.udpSocket.on('message', (data, rinfo) => {
      try {
        const senderIp = rinfo.address;
        
        // Skip our own broadcasts
        if (senderIp === this.localIp) {
          return;
        }
        
        // Process discovery packet
        try {
          const packet = JSON.parse(data.toString());
          
          if (packet.type === 'discovery') {
            const nickname = packet.nickname || 'Unknown';
            const tcpPort = packet.tcpPort || this.TCP_PORT;
            
            // Add or update peer
            const isNew = !this.peers[senderIp];
            this.peers[senderIp] = {
              nickname: nickname,
              tcpPort: tcpPort,
              lastSeen: Date.now()
            };
            
            // Update UI
            if (isNew) {
              if (this.onPeersUpdated) {
                this.onPeersUpdated(this.peers);
              }
              this.logMessage(`Discovered new peer: ${nickname} (${senderIp})`);
            }
          }
        } catch (error) {
          this.logMessage(`Error processing discovery packet: ${error.message}`);
        }
      } catch (error) {
        this.logMessage(`UDP listener error: ${error.message}`);
      }
    });
  }
  
  startTcpServer() {
    // Accept incoming TCP connections
    this.tcpServer.on('connection', (socket) => {
      try {
        const clientIp = socket.remoteAddress.replace(/^.*:/, '');
        
        // Handle data from this client
        socket.on('data', (data) => {
          try {
            // Process message
            const messageData = JSON.parse(data.toString());
            const messageType = messageData.type || 'message';
            
            if (messageType === 'message') {
              const senderNickname = messageData.nickname || 'Unknown';
              const messageText = messageData.message || '';
              const timestamp = messageData.timestamp || new Date().toLocaleTimeString();
              
              // Update statistics
              this.bytesReceived += data.length;
              this.messagesReceived += 1;
              
              // Display message
              if (this.onMessageReceived) {
                this.onMessageReceived(timestamp, senderNickname, clientIp, messageText);
              }
            }
          } catch (error) {
            this.logMessage(`Error processing message: ${error.message}`);
          }
        });
        
        // Handle client disconnection
        socket.on('end', () => {
          // Optional: handle disconnection
        });
        
        // Handle errors
        socket.on('error', (error) => {
          this.logMessage(`TCP client error: ${error.message}`);
        });
      } catch (error) {
        this.logMessage(`TCP server error: ${error.message}`);
      }
    });
    
    // Handle server errors
    this.tcpServer.on('error', (error) => {
      this.logMessage(`TCP server error: ${error.message}`);
    });
  }
  
  sendMessageToPeer(peerIp, message) {
    if (!this.peers[peerIp]) {
      this.logMessage(`Unknown peer: ${peerIp}`);
      return false;
    }
    
    const peerInfo = this.peers[peerIp];
    const peerPort = peerInfo.tcpPort || this.TCP_PORT;
    
    try {
      // Create TCP socket for sending
      const client = new net.Socket();
      
      client.connect(peerPort, peerIp, () => {
        // Create message packet
        const timestamp = new Date().toLocaleTimeString();
        const messageData = {
          type: 'message',
          nickname: this.nickname,
          message: message,
          timestamp: timestamp
        };
        
        // Send message
        const messageBytes = Buffer.from(JSON.stringify(messageData));
        client.write(messageBytes);
        
        // Update statistics
        this.bytesSent += messageBytes.length;
        this.messagesSent += 1;
        
        // Close connection
        client.end();
      });
      
      client.on('error', (error) => {
        this.logMessage(`Error sending message to ${peerIp}: ${error.message}`);
        return false;
      });
      
      return true;
    } catch (error) {
      this.logMessage(`Error sending message to ${peerIp}: ${error.message}`);
      return false;
    }
  }
  
  sendMessageToSelectedPeers(selectedPeers, message) {
    if (!selectedPeers || selectedPeers.length === 0) {
      this.logMessage('No peers selected. Please select one or more peers.');
      return;
    }
    
    // Send to each selected peer
    let successCount = 0;
    for (const peerIp of selectedPeers) {
      if (this.sendMessageToPeer(peerIp, message)) {
        successCount += 1;
      }
    }
    
    if (successCount > 0) {
      // this.logMessage(`Message sent to ${successCount} peer(s)`);
    } else {
      this.logMessage('Failed to send message to any selected peers');
    }
  }
  
  getStats() {
    const peerCount = Object.keys(this.peers).length;
    const sessionDuration = Math.floor((Date.now() - this.startTime) / 1000);
    
    return {
      status: this.running ? 'Connected' : 'Disconnected',
      localIp: this.localIp,
      udpPort: this.UDP_PORT,
      tcpPort: this.TCP_PORT,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      peersDiscovered: peerCount,
      sessionDuration: `${sessionDuration} seconds`
    };
  }
  
  checkInactivePeers() {
    const currentTime = Date.now();
    const peersToRemove = [];
    
    // Check for peers that haven't been seen in a while (60 seconds)
    for (const [ip, info] of Object.entries(this.peers)) {
      const lastSeen = info.lastSeen || 0;
      if (currentTime - lastSeen > 60000) { // 60 seconds timeout
        peersToRemove.push(ip);
      }
    }
    
    // Remove timed-out peers
    if (peersToRemove.length > 0) {
      for (const ip of peersToRemove) {
        delete this.peers[ip];
      }
      
      if (this.onPeersUpdated) {
        this.onPeersUpdated(this.peers);
      }
      
      this.logMessage(`Removed ${peersToRemove.length} inactive peer(s)`);
    }
  }
  
  logMessage(message) {
    if (this.onSystemLog) {
      this.onSystemLog(message);
    }
  }
  
  cleanup() {
    this.running = false;
    
    // Clear intervals
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    
    if (this.inactivePeersInterval) {
      clearInterval(this.inactivePeersInterval);
    }
    
    // Close UDP socket
    if (this.udpSocket) {
      this.udpSocket.close();
    }
    
    // Close TCP server
    if (this.tcpServer) {
      this.tcpServer.close();
    }
    
    this.logMessage('P2P Chat stopped');
  }
}

// Export for use in renderer process
module.exports = { NetworkManager };
