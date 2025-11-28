module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    return res.status(200).json({
        status: 'ok',
        mensagem: 'Olá! API está funcionando! 🎉',
        timestamp: new Date().toISOString(),
        env: {
            project: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'configurado' : 'não configurado',
            location: process.env.GOOGLE_CLOUD_LOCATION || 'não configurado',
            model: process.env.VERTEX_MODEL || 'não configurado'
        }
    });
};
