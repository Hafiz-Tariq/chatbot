from ollama import chat
response = chat(model='qwen3.5:9b', messages=[
    {
        'role': 'user',
        'content': 'Hello! explain what you are in 1 sentence.'
    }
])
print(response['message']['content'])