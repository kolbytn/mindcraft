# Mindcraft Architecture Diagram

```mermaid
graph TB
    %% Application Entry
    MAIN[main.js<br/>Application Entry]:::core
    MINDSERVER[MindServer<br/>Central Hub]:::core

    %% External Systems Subgraph
    subgraph EXTERNAL["🌐 External Systems"]
        MC[Minecraft Server<br/>Game World]:::external
        LLM[LLM APIs<br/>GPT-4, Claude, Gemini, etc.]:::external
        UI[Web UI<br/>MindServer Dashboard]:::external
    end

    %% Communication Layer Subgraph
    subgraph COMM["📡 Communication Layer"]
        SOCKET[Socket.IO<br/>Real-time Communication]:::communication
        PROXY[Server Proxy<br/>Agent-Server Bridge]:::communication
    end

    %% AI Agent Internal Logic Subgraph
    subgraph AGENT_LOGIC["🤖 AI Agent Internal Logic"]
        AGENT[Agent Process<br/>Individual AI Agent]:::agent
        
        %% Perception & Memory Subgraph
        subgraph PERCEPTION["🧠 Perception & Memory"]
            VISION[Vision Interpreter<br/>Screen Analysis]:::data
            HISTORY[History<br/>Conversation Memory]:::data
        end
        
        %% Planning & Decision Making Subgraph
        subgraph PLANNING["💡 Planning & Decision Making"]
            TASKS[Task System<br/>Goal Management]:::data
            MODES[Modes<br/>Behavioral States]:::data
            PROMPTER[Prompter<br/>LLM Integration]:::data
        end
        
        %% Code Generation & Execution Subgraph
        subgraph EXECUTION["✍️ Code Generation & Execution"]
            CODER[Coder<br/>Code Generation & Execution]:::data
            ACTIONS[ActionManager<br/>Action Execution]:::data
        end
        
        %% Minecraft Interface
        BOT[Mineflayer Bot<br/>Minecraft Client]:::agent
    end

    %% Main Application Flow
    MAIN --> MINDSERVER
    MAIN --> AGENT_LOGIC

    %% MindServer Connections
    MINDSERVER --> COMM
    MINDSERVER --> UI
    MINDSERVER --> AGENT

    %% Communication Layer Flow
    SOCKET --> UI
    PROXY --> AGENT
    PROXY --> MINDSERVER

    %% Agent Internal Flow - Perception
    AGENT --> VISION
    AGENT --> HISTORY
    VISION --> PROMPTER
    HISTORY --> PROMPTER

    %% Agent Internal Flow - Planning
    AGENT --> TASKS
    AGENT --> MODES
    AGENT --> PROMPTER
    TASKS --> PROMPTER
    TASKS --> ACTIONS

    %% Agent Internal Flow - Execution
    AGENT --> CODER
    AGENT --> ACTIONS
    AGENT --> BOT
    PROMPTER --> CODER
    CODER --> ACTIONS
    ACTIONS --> BOT

    %% LLM Integration
    PROMPTER --> LLM
    CODER --> LLM
    VISION --> LLM

    %% Code Execution Flow
    CODER -->|Generate Code| ACTIONS
    ACTIONS -->|Execute Code| BOT
    BOT -->|Game Actions| MC
    MC -->|Game State| BOT
    BOT -->|State Updates| AGENT

    %% Memory and Learning
    HISTORY -->|Context| CODER

    %% Behavioral Control
    MODES -->|Behavior Control| ACTIONS
    MODES -->|State Management| BOT

    %% Multi-Agent Coordination
    AGENT -.->|Chat Messages| MINDSERVER
    MINDSERVER -.->|Route Messages| AGENT
    AGENT -.->|State Updates| MINDSERVER
    MINDSERVER -.->|Agent Coordination| AGENT

    %% Data Flow Indicators
    PROMPTER -.->|"🤖 AI Decision"| CODER
    CODER -.->|"⚡ Code Execution"| ACTIONS
    ACTIONS -.->|"🎮 Game Action"| BOT

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
```

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
