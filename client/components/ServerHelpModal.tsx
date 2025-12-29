import React from 'react';
import { X, Copy, Check, Globe, Network } from 'lucide-react';

interface ServerHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerHelpModal: React.FC<ServerHelpModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const serverCode = `const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any IP
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('message', (data) => {
    // Broadcast message to everyone ELSE
    socket.broadcast.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`Blackout Chat Server running on port \${PORT}\`);
});`;

  const handleCopy = () => {
    navigator.clipboard.writeText(serverCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <h2 className="text-xl font-bold text-[#c9d1d9] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Server Setup Guide
          </h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-700">
          <p className="mb-6 text-[#8b949e] text-sm leading-relaxed">
            Run this Node.js server on one machine. Other users connect to it using your IP address.
            This works on <b>Local WiFi (LAN)</b> or <b>National Intranet (WAN)</b> without global internet.
          </p>

          {/* Code Section */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-2">
               <h3 className="font-semibold text-white">Server Code (server.js)</h3>
               <button 
                onClick={handleCopy}
                className="flex items-center gap-2 text-xs bg-[#238636] hover:bg-[#2ea043] text-white px-2 py-1 rounded transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            </div>
            <pre className="bg-black rounded p-3 font-mono text-sm text-[#c9d1d9] overflow-x-auto border border-[#30363d] mb-2">
              {serverCode}
            </pre>
            <div className="flex gap-2 text-xs font-mono text-yellow-500/80">
              <span className="px-2 py-1 bg-yellow-500/10 rounded border border-yellow-500/20">npm init -y</span>
              <span className="px-2 py-1 bg-yellow-500/10 rounded border border-yellow-500/20">npm i express socket.io cors</span>
              <span className="px-2 py-1 bg-yellow-500/10 rounded border border-yellow-500/20">node server.js</span>
            </div>
          </div>

          {/* Connection Guides Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LAN Guide */}
            <div className="p-4 rounded-lg bg-[#0d1117] border border-[#30363d]">
               <div className="flex items-center gap-2 mb-3 text-green-400">
                  <Network size={18} />
                  <h4 className="font-bold text-sm">Local Area (Same WiFi)</h4>
               </div>
               <ol className="list-decimal list-inside text-xs text-[#8b949e] space-y-2">
                 <li>Find your <b>Local IP</b> (e.g., <code>192.168.1.5</code>).</li>
                 <li>Users connect to: <br/><code className="text-white bg-[#21262d] px-1 py-0.5 rounded">http://[LOCAL_IP]:3000</code></li>
               </ol>
            </div>

            {/* WAN Guide */}
            <div className="p-4 rounded-lg bg-[#0d1117] border border-[#30363d]">
               <div className="flex items-center gap-2 mb-3 text-blue-400">
                  <Globe size={18} />
                  <h4 className="font-bold text-sm">Remote (Different WiFi)</h4>
               </div>
               <ol className="list-decimal list-inside text-xs text-[#8b949e] space-y-2">
                 <li>Log into your <b>Router Admin Panel</b>.</li>
                 <li><b>Port Forward</b> TCP Port <code>3000</code> to your computer's Local IP.</li>
                 <li>Find your <b>External IP</b> (Google "what is my ip").</li>
                 <li>Users connect to: <br/><code className="text-white bg-[#21262d] px-1 py-0.5 rounded">http://[EXTERNAL_IP]:3000</code></li>
               </ol>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-200">
             <b>Note on National Intranet:</b> If global internet is down but local ISP routing is active, users in other cities can connect via your <b>External IP</b> provided you have Port Forwarded correctly.
          </div>

        </div>
      </div>
    </div>
  );
};