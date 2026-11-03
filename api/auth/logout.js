module.exports = async (req, res) => {
  res.writeHead(302, {
    'Location': '/',
    'Set-Cookie': [
      'horizon_user=; Path=/; Max-Age=0; SameSite=Lax',
      'horizon_sig=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    ]
  });
  res.end();
};
