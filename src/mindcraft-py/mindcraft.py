import subprocess
import socketio
import time
import json
import os
import atexit
import threading
import sys
import signal

class Mindcraft:
    def __init__(self):
        self.sio = socketio.Client()
        self.process = None
        self.connected = False
        self.log_thread = None

    def _log_reader(self):
        for line in iter(self.process.stdout.readline, ''):
            sys.stdout.write(f'[Node.js] {line}')
            sys.stdout.flush()

    def init(self, port=8080):
        if self.process:
            return

        self.port = port
        
        node_script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'init-mindcraft.js'))
        
        self.process = subprocess.Popen([
            'node',
            node_script_path,
            '--mindserver_port', str(self.port)
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        
        self.log_thread = threading.Thread(target=self._log_reader)
        self.log_thread.daemon = True
        self.log_thread.start()

        atexit.register(self.shutdown)
        time.sleep(2) # Give server time to start before connecting

        try:
            self.sio.connect(f'http://localhost:{self.port}')
            self.connected = True
            print("Connected to MindServer. Mindcraft is initialized.")
        except socketio.exceptions.ConnectionError as e:
            print(f"Failed to connect to MindServer: {e}")
            self.shutdown()
            raise

    def create_agent(self, settings_json):
        if not self.connected:
            raise Exception("Not connected to MindServer. Call init() first.")
        
        profile_data = settings_json.get('profile', {})
        
        def callback(response):
            if response.get('success'):
                print(f"Agent '{profile_data.get('name')}' created successfully")
            else:
                print(f"Error creating agent: {response.get('error', 'Unknown error')}")

        self.sio.emit('create-agent', settings_json, callback=callback)

    def shutdown(self):
        if self.sio.connected:
            self.sio.disconnect()
            self.connected = False
        if self.process:
            self.process.terminate()
            self.process.wait()
            self.process = None
        print("Mindcraft shut down.")

    def wait(self):
        """Block the main thread until Ctrl+C is pressed so the server stays up,"""
        print("Server is running. Press Ctrl+C to exit.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nCtrl+C detected. Exiting...")
            self.shutdown()

mindcraft_instance = Mindcraft()

def init(port=8080):
    mindcraft_instance.init(port)

def create_agent(settings_json):
    mindcraft_instance.create_agent(settings_json)
    
def shutdown():
    mindcraft_instance.shutdown()

def wait():
    mindcraft_instance.wait()
