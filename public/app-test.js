// Teste simples
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔍 Testando API...');
    
    const response = await fetch('/api/health');
    const data = await response.json();
    console.log('✅ Health check:', data);
    
    // Teste com dados fake
    const testData = {
        imagens: [{
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            nome: 'test.png'
        }]
    };
    
    console.log('📤 Testando processar-etapa1...');
    try {
        const response2 = await fetch('/api/processar-etapa1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData)
        });
        
        console.log('📥 Status:', response2.status);
        const result = await response2.json();
        console.log('📋 Resultado:', result);
    } catch (error) {
        console.error('❌ Erro:', error);
    }
});
