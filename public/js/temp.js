const bcrypt = require('bcrypt');
bcrypt.hash('MISOMALI13', 10).then(console.log).catch(console.error);