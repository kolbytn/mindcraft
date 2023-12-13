export class Events {
    constructor(agent, events) {
        this.events = events;
        if (agent != null)
            this.init(agent, events);
    }

    init(agent, events) {
        this.events = events;
        for (let [event, callback, params] of events) {
            if (callback != null)
                agent.bot.on(event, this[callback].bind(this, agent, params));
        }

        agent.bot.on('time', () => {
            if (agent.bot.time.timeOfDay == 0)
                agent.bot.emit('sunrise');
            else if (agent.bot.time.timeOfDay == 6000)
                agent.bot.emit('noon');
            else if (agent.bot.time.timeOfDay == 12000)
                agent.bot.emit('sunset');
            else if (agent.bot.time.timeOfDay == 18000)
                agent.bot.emit('midnight');
        });

        agent.bot.on('health', () => {
            if (agent.bot.health < 20)
                agent.bot.emit('damaged');
        });
    }

    executeCode(agent, code) {
        agent.executeCode(code);
    }

    sendThought(agent, message) {
        agent.history.add(agent.name, message);
        agent.handleMessage();
    }

}