const fs = require('fs').promises;
const os = require('os');
const readline = require('readline');
const { OpenAIApi, Configuration } = require('openai');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
}

const CHAT_COMMAND_SAVE_TO = "save to";
const CHAT_COMMAND_RESET_CHAT = "reset";
const CHAT_DEFAULT_MODEL = 'gpt-3.5-turbo';

class OpenAiChat {

    constructor({ model, promptSource, openaiApiKey }) {
        this._messages = [];
        this._model = model || CHAT_DEFAULT_MODEL;
        this._promptSource = promptSource; 
        this._openaiApiKey = openaiApiKey;
        this._openai = null;
    }

    _initialize() {
        const openaiConf = new Configuration({
            apiKey: this._openaiApiKey
        });
        this._openai = new OpenAIApi(openaiConf);
    }

    _transcript() {
        return this._messages
            .map(msg => {
                const msgSourceIndicator = msg.role === "user" ? '>> ' : '<< ';
                return `${msgSourceIndicator}${msg.content.includes(os.EOL) ? os.EOL : ''}${msg.content}`
            })
            .join(os.EOL);
    }

    _resetChat() {
        this._messages.splice(0, this._messages.length);
        console.log("Chat history has been reset.");
    }

    async _callOpenaiChatApi() {
        const req = {
            model: this._model,
            messages: this._messages
        };

        const { data } = await this._openai.createChatCompletion(req);

        const { message } = data.choices[0];
        return message;
    }

    async handlePrompt(prompt) {

        if (!prompt) {
            throw new Error(`Invalid prompt ${prompt}.`);
        }

        if (prompt.startsWith(CHAT_COMMAND_SAVE_TO)) {
            const filename = prompt.substring(CHAT_COMMAND_SAVE_TO.length + 1);
            await fs.writeFile(filename, this._transcript());
            console.log(`Chat saved to ${filename}`);
            return;
        }

        if (prompt.startsWith(CHAT_COMMAND_RESET_CHAT)) {
            this._resetChat();
            return;
        }

        const userMessage = { role: "user", content: prompt };
        this._messages.push(userMessage);
        if (process.env.DEBUG) {
            console.log(JSON.stringify(userMessage));
        }

        const answer = await this._callOpenaiChatApi();

        this._messages.push(answer);
        console.log(answer.content);

        if (process.env.DEBUG) {
            console.log(JSON.stringify(answer));
        }
    }

    async chat() {
        console.log('Welcome! Let\'s chat.');
        
        for await (const prompt of this._promptSource()) {
            try {
                await this.handlePrompt(prompt);
            } catch (err) {
                const res = err.response;
                if (res && res.data && res.data.error && res.data.error.message) {
                    let errMessage = res.data.error.message;
                    console.error(`Error ${res.status} ${res.statusText}: ${errMessage}`);
                    continue;
                }

                console.error(err);
            }
        }
    }
}

async function* promptFromReadline() {
    while (true) {
        yield await new Promise((resolve) => rl.question('> ', resolve));
    }
}

async function* promptFromArg() {
    yield await process.argv.slice(2).join(' ').trim();
}
  

const promptSource = process.argv.length > 2
    ? promptFromArg
    : promptFromReadline;

const chat = new OpenAiChat({ 
    promptSource, 
    model: process.env.CHAT_OPENAI_MODEL,
    openaiApiKey: apiKey
});

chat._initialize();

chat.chat()
    .then(
        () => process.exit(0), 
        (err) => {
            console.error(err);
            process.exit(1);
        });

