# Mindcraft Architecture Diagram

```mermaid
graph TB
    %% Top Level - Application Entry
    MAIN[main.js<br/>Application Entry]:::core

    %% External Systems - Top Right
    subgraph EXTERNAL["🌐 External Systems"]
        UI[Web UI<br/>MindServer Dashboard]:::external
        LLM[LLM APIs<br/>GPT-4, Claude, Gemini, etc.]:::external
        MC[Minecraft Server<br/>Game World]:::external
    end

    %% Central Hub - Middle
    MINDSERVER[MindServer<br/>Central Hub]:::core

    %% Communication Layer - Below MindServer
    subgraph COMM["📡 Communication Layer"]
        SOCKET[Socket.IO<br/>Real-time Communication]:::communication
        PROXY[Server Proxy<br/>Agent-Server Bridge]:::communication
    end

    %% AI Agent - Left Side with Vertical Flow
    subgraph AGENT_LOGIC["🤖 AI Agent Internal Logic"]
        AGENT[Agent Process<br/>Individual AI Agent]:::agent
        
        %% Perception & Memory - Top of Agent
        subgraph PERCEPTION["🧠 Perception & Memory"]
            VISION[Vision Interpreter<br/>Screen Analysis]:::data
            HISTORY[History<br/>Conversation Memory]:::data
        end
        
        %% Planning & Decision Making - Middle of Agent
        subgraph PLANNING["💡 Planning & Decision Making"]
            TASKS[Task System<br/>Goal Management]:::data
            MODES[Modes<br/>Behavioral States]:::data
            PROMPTER[Prompter<br/>LLM Integration]:::data
        end
        
        %% Code Generation & Execution - Bottom of Agent
        subgraph EXECUTION["✍️ Code Generation & Execution"]
            CODER[Coder<br/>Code Generation & Execution]:::data
            ACTIONS[ActionManager<br/>Action Execution]:::data
        end
        
        %% Minecraft Interface - Right of Agent
        BOT[Mineflayer Bot<br/>Minecraft Client]:::agent
    end

    %% System Initialization Flow (Blue)
    MAIN -->|"🚀 Initialize"| MINDSERVER
    MAIN -->|"🚀 Initialize"| AGENT

    %% Central Hub Management (Purple)
    MINDSERVER -->|"🖥️ Serve"| UI
    MINDSERVER -->|"📡 Manage"| COMM
    MINDSERVER -->|"🤖 Control"| AGENT

    %% Communication Layer (Orange)
    SOCKET -->|"📡 Real-time"| UI
    PROXY -->|"🔗 Connect"| AGENT
    PROXY -->|"📡 Report"| MINDSERVER

    %% Agent Internal Flow - Top to Bottom (Green/Yellow/Red)
    AGENT -->|"👁️ Observe"| VISION
    AGENT -->|"🧠 Remember"| HISTORY
    AGENT -->|"🎯 Set Goals"| TASKS
    AGENT -->|"🎭 Set Mode"| MODES
    AGENT -->|"💭 Think"| PROMPTER
    AGENT -->|"💻 Generate"| CODER
    AGENT -->|"⚡ Execute"| ACTIONS
    AGENT -->|"🎮 Control"| BOT

    %% Perception to Planning (Green)
    VISION -->|"📊 Visual Data"| PROMPTER
    HISTORY -->|"📚 Context"| PROMPTER

    %% Planning to Execution (Yellow)
    TASKS -->|"📋 Task Context"| PROMPTER
    TASKS -->|"✅ Validate"| ACTIONS
    MODES -->|"Behavior Control"| ACTIONS
    MODES -->|"State Management"| BOT

    %% AI Integration (Cyan) - Right side connections
    PROMPTER -->|"🤖 Query"| LLM
    CODER -->|"🤖 Query"| LLM
    VISION -->|"🤖 Query"| LLM

    %% Execution Flow (Red) - Bottom to Right
    PROMPTER -->|"🤖 AI Decision"| CODER
    CODER -->|"⚡ Code Execution"| ACTIONS
    ACTIONS -->|"🎮 Game Action"| BOT
    BOT -->|"Game Actions"| MC

    %% Feedback Loop (Red/Green) - Right to Left
    MC -->|"Game State"| BOT
    BOT -->|"State Updates"| AGENT
    HISTORY -->|"Context"| CODER

    %% Multi-Agent Coordination (Purple Dashed) - Top connections
    AGENT -.->|"💬 Chat Messages"| MINDSERVER
    MINDSERVER -.->|"📤 Route Messages"| AGENT
    AGENT -.->|"📊 State Updates"| MINDSERVER
    MINDSERVER -.->|"🎯 Agent Coordination"| AGENT

    %% Styling
    classDef external fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#000
    classDef core fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px,color:#000
    classDef agent fill:#e8f5e8,stroke:#388e3c,stroke-width:2px,color:#000
    classDef communication fill:#fff8e1,stroke:#f57c00,stroke-width:2px,color:#000
    classDef data fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000

    class MC,LLM,UI external
    class MAIN,MINDSERVER core
    class AGENT,BOT agent
    class SOCKET,PROXY communication
    class PROMPTER,CODER,ACTIONS,TASKS,HISTORY,MODES,VISION data

    %% Link Styling - Organized by Flow Type
    %% System Initialization (Blue)
    linkStyle 0 stroke:#2196F3,stroke-width:3px
    linkStyle 1 stroke:#2196F3,stroke-width:3px
    
    %% Central Hub Management (Purple)
    linkStyle 2 stroke:#9C27B0,stroke-width:2px
    linkStyle 3 stroke:#9C27B0,stroke-width:2px
    linkStyle 4 stroke:#9C27B0,stroke-width:2px
    
    %% Communication Layer (Orange)
    linkStyle 5 stroke:#FF9800,stroke-width:2px
    linkStyle 6 stroke:#FF9800,stroke-width:2px
    linkStyle 7 stroke:#FF9800,stroke-width:2px
    
    %% Agent Internal Flow (Mixed colors)
    linkStyle 8 stroke:#4CAF50,stroke-width:2px
    linkStyle 9 stroke:#4CAF50,stroke-width:2px
    linkStyle 10 stroke:#FFEB3B,stroke-width:2px
    linkStyle 11 stroke:#FFEB3B,stroke-width:2px
    linkStyle 12 stroke:#FFEB3B,stroke-width:2px
    linkStyle 13 stroke:#F44336,stroke-width:2px
    linkStyle 14 stroke:#F44336,stroke-width:2px
    linkStyle 15 stroke:#F44336,stroke-width:2px
    
    %% Perception to Planning (Green)
    linkStyle 16 stroke:#4CAF50,stroke-width:2px
    linkStyle 17 stroke:#4CAF50,stroke-width:2px
    
    %% Planning to Execution (Yellow)
    linkStyle 18 stroke:#FFEB3B,stroke-width:2px
    linkStyle 19 stroke:#FFEB3B,stroke-width:2px
    linkStyle 20 stroke:#FFEB3B,stroke-width:2px
    linkStyle 21 stroke:#FFEB3B,stroke-width:2px
    
    %% AI Integration (Cyan)
    linkStyle 22 stroke:#00BCD4,stroke-width:2px
    linkStyle 23 stroke:#00BCD4,stroke-width:2px
    linkStyle 24 stroke:#00BCD4,stroke-width:2px
    
    %% Execution Flow (Red)
    linkStyle 25 stroke:#F44336,stroke-width:2px
    linkStyle 26 stroke:#F44336,stroke-width:2px
    linkStyle 27 stroke:#F44336,stroke-width:2px
    linkStyle 28 stroke:#F44336,stroke-width:2px
    
    %% Feedback Loop (Mixed)
    linkStyle 29 stroke:#F44336,stroke-width:2px
    linkStyle 30 stroke:#F44336,stroke-width:2px
    linkStyle 31 stroke:#4CAF50,stroke-width:2px
    
    %% Multi-Agent Coordination (Purple Dashed)
    linkStyle 32 stroke:#9C27B0,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 33 stroke:#9C27B0,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 34 stroke:#9C27B0,stroke-width:2px,stroke-dasharray: 5 5
    linkStyle 35 stroke:#9C27B0,stroke-width:2px,stroke-dasharray: 5 5
```

## Color-Coded Data Flow Legend

### **Arrow Colors & Meanings:**
- 🔵 **Blue** - System initialization and startup
- 🟣 **Purple** - Central hub management and coordination
- 🟠 **Orange** - Communication layer and real-time messaging
- 🟢 **Green** - Data input, perception, and learning
- 🟡 **Yellow** - Planning, decision making, and control
- 🔴 **Red** - Action execution and game interactions
- 🔵 **Cyan** - External AI/LLM integration
- 🟣 **Purple (Dashed)** - Multi-agent coordination

### **Flow Patterns:**
1. **System Startup**: Blue arrows from main.js
2. **Data Perception**: Green arrows for vision and memory
3. **Decision Making**: Yellow arrows for planning and control
4. **Action Execution**: Red arrows for code generation and game actions
5. **External AI**: Cyan arrows to LLM APIs
6. **Multi-Agent**: Purple dashed arrows for coordination

## Key Components Explained

### **Core System**
- **main.js**: Application entry point, initializes MindServer and agents
- **MindServer**: Central coordination hub using Express + Socket.IO
- **Agent Process**: Individual AI agent running in separate process

### **Agent Architecture**
- **Prompter**: Handles LLM communication and prompt engineering
- **Coder**: Generates and executes JavaScript code for complex behaviors
- **ActionManager**: Manages action execution with timeout and interruption handling
- **Task System**: Defines and validates goals for agents
- **History**: Maintains conversation context and memory
- **Modes**: Controls behavioral states (idle, working, following, etc.)
- **Vision Interpreter**: Analyzes Minecraft screen for visual understanding

### **Communication Flow**
1. **User Input** → Web UI → MindServer → Agent
2. **Perception** → Vision/History → Prompter → LLM → Response
3. **Planning** → Task System → Prompter → Coder → ActionManager
4. **Execution** → ActionManager → Bot → Minecraft → Game State
5. **Multi-Agent Chat** → Agent → MindServer → Route to Other Agents
6. **State Coordination** → Agent → MindServer → Broadcast to All Agents

### **Data Flow Patterns**
- **🧠 Perception**: Vision + History → Context for Decision Making
- **💡 Planning**: Tasks + Modes → Goal Setting + Behavior Control  
- **✍️ Execution**: Prompter → Coder → ActionManager → Bot
- **🔄 Feedback**: Game State → Bot → Agent → Learning Loop

### **Key Features**
- **Autonomous Play**: Agents make independent decisions
- **Code Generation**: Write and execute custom JavaScript behaviors
- **Multi-Agent Coordination**: Multiple agents working together
- **Real-time Communication**: Socket.IO for instant updates
- **Memory Management**: Persistent conversation history
- **Task Management**: Complex goal setting and validation
