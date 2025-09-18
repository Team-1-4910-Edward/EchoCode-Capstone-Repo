// Script for the chat view
(function () {
    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // Elements
    const messagesContainer = document.getElementById('messages-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const voiceButton = document.getElementById('voice-button');
    const listeningIndicator = document.getElementById('listening-indicator');
    const loadingIndicator = document.getElementById('loading-indicator');

    let currentAssistantMessage = null;

    // Send a message
    function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;
        
        // Add user message to UI
        addMessageToUI('user', text);
        
        // Clear input
        userInput.value = '';
        
        // Send to extension
        vscode.postMessage({
            type: 'userInput',
            text: text
        });
        
        // Create placeholder for assistant response
        currentAssistantMessage = addMessageToUI('assistant', '');
    }
    
    // Add message to UI
    function addMessageToUI(role, text) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = text;
        
        messageElement.appendChild(contentElement);
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return contentElement;
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    //Mic button to tell extension to start voice input
    voiceButton.addEventListener('click', () => {
        vscode.postMessage({ type: "startVoiceInput" });
        // Show indicator while extension records
        voiceButton.classList.add('active');
        listeningIndicator.classList.remove('hidden');
        listeningIndicator.classList.add('visible');
        userInput.placeholder = 'Listening...';
    });
    
    // Handle messages from the extension
    window.addEventListener('message', (event) => {
        const message = event.data;
        
        switch (message.type) {
            case 'response':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent = message.text;
                    currentAssistantMessage = null;
                } else {
                    addMessageToUI('assistant', message.text);
                }
                break;
                
            case 'responseFragment':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent += message.text;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
                break;
                
            case 'responseComplete':
                currentAssistantMessage = null;
                break;
                
            case 'responseLoading':
                if (message.started) {
                    loadingIndicator.classList.remove('hidden');
                    loadingIndicator.classList.add('visible');
                } else {
                    loadingIndicator.classList.add('hidden');
                    loadingIndicator.classList.remove('visible');
                }
                break;
                
            case 'responseError':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent = message.error || 'Error getting response';
                    currentAssistantMessage.parentElement.classList.add('error');
                    currentAssistantMessage = null;
                }
                break;

            case 'voiceRecognitionResult':
                // Transcript will come back from extension
                userInput.value = message.text;
                userInput.focus();
                // Reset UI state
                voiceButton.classList.remove('active');
                listeningIndicator.classList.add('hidden');
                listeningIndicator.classList.remove('visible');
                userInput.placeholder = 'Ask a question about your code...';
                break;
                
            case 'voiceRecognitionError':
                voiceButton.classList.remove('active');
                listeningIndicator.classList.add('hidden');
                listeningIndicator.classList.remove('visible');
                userInput.placeholder = 'Ask a question about your code...';
                addMessageToUI('system', `Voice recognition error: ${message.error || 'Unknown error'}`);
                break;
        }
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
})();