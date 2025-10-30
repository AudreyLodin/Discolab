const express = require('express');
const mysql = require('mysql');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
app.use(require('cors')());
const io = socketIo(server)
const CryptoJS = require('crypto-js');

const fs = require('fs');

const {spawn} = require ('child_process');

const PORT = 3000;
var pers = 0;
var invitation={salon: [],groupe: []};
var listonline=[];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chat'
});

connection.connect((err) => {
    if (err) {
        console.error('Erreur de connexion : ' + err.stack);
        return;
    }
    ////console.log("Connexion réussie à la base de données");
});


function loadMessages(salon, callback) {
    const sql = 'SELECT utilisateur.id, utilisateur.prenom, utilisateur.nom, message.contenu, message.date FROM message, utilisateur WHERE utilisateur.id=message.auteur and salon = ? ORDER BY date ASC';
    connection.query(sql, [salon], (err, results) => {
        if (err) throw err;
        //console.log(results);
        callback(results);
    });
}

function pseudo(id, callback){
    var nom='';
    var prenom='';
    const sql1= 'SELECT prenom, nom FROM utilisateur WHERE id = ?;';
    connection.query(sql1, [id], (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête de connexion :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) {
            callback(results[0]);
        } 
    });
    
    
}

// Gestion de la connexion des sockets
io.on('connection', async (socket) => {
    pers+=1;
    let ind=0,numero=0;
    //socket.emit('numero',pers);
    socket.on('online',(ligne)=>{
        let i=0;
        ind=0;
        for(let i=0; i< listonline.length;i++){
            if(listonline[i].id==ligne.id){
                ind=1;
                numero=i;
            }
        }
        if(ind==0){
            numero=listonline.length;
            listonline.push(ligne);
        }
        io.emit('numero',numero);
        //console.log("Le numero : "+numero);
        //console.log(listonline);
        io.emit('online',listonline);
    });

    //console.log('Nouvel utilisateur connecté '+pers);

    socket.on('send message', async (data) => {
        const { id, idsalon, message, date } = data;
        const sql = 'INSERT INTO message (auteur, salon, contenu, date) VALUES (?, ?, ?, ?)';
        connection.query(sql, [id, idsalon, message, date], (err, results) => {
            if (err) {
                console.error('Erreur lors de l\'insertion des données :', err);
                return;
            }
            pseudo(id,(user)=>{
                const msg = {
                    idmsg: results.insertId,
                    nom: user.nom,
                    prenom: user.prenom,
                    id: id,
                    contenu: message,
                    salon: idsalon,
                    date: date
                };
                io.emit('recevoir message', msg);
                //console.log("Message inséré avec succès, ID:", results.insertId);
            })
            
        });
    });

    socket.on('invite',(data)=>{
        invitation=data;
        //console.log(invitation.groupe.length);
    });
    if(invitation.groupe.length>0){
        //console.log("Tu es toujours là");
        io.emit('invite',invitation);
    }
    socket.on('stop invite',data=>{
        let i =0, indice=0;
        invitation.groupe.forEach((ligne)=>{
            if(ligne.id==data){
                indice=i;
            }
            i++;
        });
        invitation.groupe.splice(indice,1);
        //console.log(invitation.groupe);
        io.emit('stop invite', 'ok');
    });

    socket.on('ecrit',(data)=>{
        socket.broadcast.emit('membre ecrit',{ prenom: data.prenom, nom: data.nom, salon: data.salon })
    })

    socket.on('stop ecrit',(data)=>{
        socket.broadcast.emit('stop membre',{ prenom: data.prenom, nom: data.nom, salon: data.salon })
    })

    socket.on('load chat', (salon) => {
        loadMessages(salon, (messages) => {
            socket.emit('historique chat', messages);
        });
    });

    socket.on('desconnect', (id) => {
        let i =0, indice=0;
        listonline.forEach((ligne)=>{
            if(ligne.id==id){
                indice=i;
            }
            i++;
        });
        listonline.splice(indice,1);
        //console.log(listonline);
        io.emit('desconnect',listonline);
    });
    /*
    socket.on('disconnect', (id) => {
        //console.log('🔥: A user disconnected');
        let i =0, indice=0;
        listonline.forEach((ligne)=>{
            if(ligne.id==id){
                indice=i;
            }
            i++;
        });
        listonline.splice(indice,1);
        //console.log(listonline);
        //io.emit('disconnect',);
        
        //Updates the list of users when a user disconnects from the server
        users = users.filter((user) => user.socketID !== socket.id);
        // //console.log(users);
        //Sends the list of users to the client
        socket.emit('newUserResponse', users);
        socket.disconnect();
      });*/
});

app.post('/connexion', (req, res) => {
    const { email, password } = req.body;
    const hashage = CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
    const sql = `SELECT * FROM utilisateur WHERE email = ? AND motdepasse = ?`;
    
    connection.query(sql, [email, hashage], (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête de connexion :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) {
            const info = results[0];
            res.json({ success: true, info });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
});

app.post('/search', (req, res) => {
    const { email } = req.body;
    //console.log(email);
    const mail = '%'+email.toString()+'%';
    //console.log(mail);
    const sql = `SELECT id, prenom, nom, email FROM utilisateur WHERE email like ?`;
    
    connection.query(sql, [mail], (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête de connexion :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) {
            const info = results;
            //console.log(results);
            res.json({ success: true, info });
        } else {
            res.json({ success: false, message: "Email pas bon mail" });
        }
    });
});


app.post('/inscription', (req, res) => {
    const { prenom,nom,email, pwd } = req.body;
    const hashage = CryptoJS.SHA256(pwd).toString(CryptoJS.enc.Hex);
    const sql = `INSERT INTO utilisateur (prenom, nom, email, motdepasse) VALUES (?, ?, ?, ?)`;

    connection.query(sql, [prenom, nom, email, hashage], (err, result) => {
        if (err) {
            console.error('Erreur lors de l\'insertion des données :', err);
            res.json({ success: false});
            return;
        }
        //console.log("Utilisateur inséré avec succès, ID:", result.insertId);
        res.json({ success: true, userId: result.insertId });
    });
});

app.post('/utilisateur', (req, res) => {
    const sql = `SELECT id, prenom, nom, email FROM utilisateur`;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }
        res.json({ success: true, info: results });
    });
});

app.post('/mail', (req, res) => {
    const { id } = req.body;
    const sql = `SELECT email FROM utilisateur WHERE id=?`;
    
    connection.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête de connexion :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) {
            const info = results;
            res.json({ success: true, info });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
});

app.post('/salon', (req, res) => {
    const { id, desc, type } = req.body;
    const sql = "INSERT INTO salon (admin, descricption, type) VALUES (?, ?, ?)";

    connection.query(sql, [id, desc, type], (err, results) => {
        if (err) {
            console.error('Erreur lors de l\'insertion des données :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }
        //console.log("Salon créé avec succès, ID:", results.insertId);
        res.json({ id: results.insertId });
    });
});

app.post('/suppressionsalon', (req, res) => {
    const { id } = req.body;
    const sql3 = `select fichier.nom, fichier.extention from fichier where fichier.salon=${id};`;
    connection.query(sql3, (err, results) => {
        if (err) {
            return;
        }
        if(results.length>0){
            results.forEach(result=>{
                let fi=result.nom.toString().concat('.'.concat(result.extention.toString()));
                console.log(fi);
                const file = path.join(__dirname, 'fichier', fi);
                fs.unlink(file, (err) => {
                    if (err) throw err;
                    console.log('Le fichier a été supprimé');
                });

            });
        }
        
        //res.json({ success: true });
    });
    const sql = `DELETE FROM membre WHERE membre.salon = ${id}`;
    const sql1 = `DELETE FROM fichier WHERE fichier.salon = ${id}`;
    const sql2 = `DELETE FROM salon WHERE salon.id = ${id}`;

    connection.query(sql, (err, results) => {
        if (err) {
            return;
        }
        return;
        //res.json({ success: true });
    });
    connection.query(sql1, (err, results) => {
        if (err) {
            return;
        }
        return;
        //res.json({ success: true });
    });
    connection.query(sql2, (err, results) => {
        if (err) {
            return;
        }
        return;
        //res.json({ success: true });
    });
    res.json({ success: true});
});

app.post('/allsalon', (req, res) => {
    const { id } = req.body;


    const sql = `select salon.id, salon.descricption, salon.admin from salon, membre where salon.id=membre.salon and membre.personne=${id} group by salon.id;`;
    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            //console.log(results);
            res.json({ success: true, info: results });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
    
});

app.post('/perssalon', (req, res) => {
    const { idpers1,idpers2 } = req.body;


    const sql = `select salon.id, salon.descricption from salon, membre m1, membre m2 where salon.id=m1.salon and m1.personne=${idpers1} and m2.personne=${idpers2} group by salon.id;`;
    connection.query(sql, (err, results) => {
        if (err) {
            //console.error('Erreur lors de la requête utilisateur :', err);
            //res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            //console.log(results);
            res.json({ success: true, info: results });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
    
});


app.post('/message', (req, res) => {
    const { auteur, salon, contenu, date } = req.body;
    const sql = "INSERT INTO message (auteur, salon, contenu, date) VALUES (?, ?, ?, ?)";

    connection.query(sql, [auteur, salon, contenu, date], (err, results) => {
        if (err) {
            console.error('Erreur lors de l\'insertion des données :', err);
            res.status(500).send("Erreur lors de l'insertion du message");
            return;
        }
        //console.log("Message inséré avec succès, ID:", results.insertId);
        res.json({ success: true, messageId: results.insertId });
    });
});




app.post('/fichier', (req, res) => {
    const { idprop, idsalon, nom, extension } = req.body;
    const sql = "INSERT INTO fichier (proprietaire, salon, nom, extention) VALUES (?, ?, ?, ?)";

    connection.query(sql, [idprop, idsalon, nom, extension], (err, results) => {
        if (err) {
            console.error('Erreur lors de l\'insertion des données :', err);
            res.status(500).send("Erreur lors de l'insertion du message");
            return;
        }
        //console.log("Message inséré avec succès, ID:", results.insertId);
        res.json({ success: true, messageId: results.insertId });
    });
});

app.post('/propfichier', (req, res) => {
    const { idprop, idsalon } = req.body;
    const sql=`select fichier.id from fichier where proprietaire=${idprop} and salon=${idsalon};`;

    connection.query(sql,  (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            res.json({ success: true, info: results });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
});

app.post('/suppressionfichier', (req, res) => {
    const { id } = req.body;
    const sql = `DELETE FROM fichier WHERE fichier.id = ${id}`;

    connection.query(sql, (err, results) => {
        if (err) {
            return;
        }
        res.json({ success: true });
    });
});

app.post('/allfichier', (req, res) => {
    const { idprop, idsalon } = req.body;
    const sql = `select fichier.id, fichier.nom, fichier.extention from fichier where salon=${idsalon} group by fichier.id;`;

    connection.query(sql,  (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            //console.log(results);
            res.json({ success: true, info: results });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
});

app.post('/membre', (req, res) => {
    const { personne , salon, role, date } = req.body;
    const sql = `INSERT INTO membre (personne, salon, role, date) VALUES (?, ?, ?, ?);`;

    connection.query(sql, [personne , salon, role, date], (err, results) => {
        if (err) {
            //console.error('Erreur lors de l\'insertion des données :', err);
            //res.status(500).send("Erreur lors de l'insertion du message");
            return;
        }
        //console.log("Message inséré avec succès, ID:", results.insertId);
        res.json({ success: true, id: results.insertId });
    });
});

app.post('/suppressionmembre', (req, res) => {
    const { personne , salon } = req.body;
    const sql = `DELETE FROM membre WHERE membre.personne = ${personne} and membre.salon=${salon}`;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Erreur lors de l\'insertion des données :', err);
            res.status(500).send("Erreur lors de l'insertion du message");
            return;
        }
        //console.log("Suppresion réussie");
        res.json({ success: true });
    });
});

app.post('/rolemembre', (req, res) => {
    const { idper, idsalon } = req.body;
    const sql = `select salon.admin from membre, salon where salon.id=membre.salon and membre.salon=${idsalon} and membre.personne=${idper} group by membre.personne;`;

    connection.query(sql,  (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            res.json({ success: true, info: results[0] });
        } else {
            res.json({ success: false, message: "role administrateur" });
        }
    });
});

app.post('/allmembre', (req, res) => {
    const { idsalon } = req.body;
    const sql = `select utilisateur.id, utilisateur.prenom, utilisateur.nom from utilisateur, membre where utilisateur.id=membre.personne and membre.salon=${idsalon} group by membre.personne order by utilisateur.prenom asc;`;

    connection.query(sql,  (err, results) => {
        if (err) {
            console.error('Erreur lors de la requête utilisateur :', err);
            res.status(500).send("Erreur de serveur");
            return;
        }

        if (results.length > 0) { 
            ////console.log(results);
            res.json({ success: true, info: results });
        } else {
            res.json({ success: false, message: "Email ou mot de passe incorrect" });
        }
    });
});

/******************************************************************************** */
// Fichier
/******************************************************************************** */

app.use(express.json());
app.post('/save-file', (req, res) => {
    const { nom, contenu } = req.body; 
    
    const fichier = path.join(__dirname, 'fichier', nom);

    fs.writeFile(fichier, contenu, (err)=>{
        if(err){
            throw err;
        }
        res.json({ success: true, data: 'oui' });
        //console.log("Fichier enregistrée");
    })
});


app.post('/read-file', (req, res) => {
    const { nom } = req.body;


    const file = path.join(__dirname, 'fichier', nom);

    fs.readFile(file, 'utf8', (err, contenu) => {
        if (err) {
            console.error('Erreur lors de la lecture du fichier:', err.message);
            return res.json({ success: false, message: 'Erreur lors de la lecture du fichier.' });
        }
        res.json({ success: true, content: contenu });
    });
});

app.post('/sup-file',(req, res) => {
    const { nom } = req.body;


    const file = path.join(__dirname, 'fichier', nom);
    fs.unlink(file, (err) => {
        if (err) throw err;
        console.log('Le fichier a été supprimé');
    });
    
});

/*
app.post('/api/python-message', async (req,res)=>{
    const { nom,valeur } = req.body;
    //console.log(nom);
    var cool='';
    var bool=false;
    //nom = nom.toString();
    const fichier = path.join(__dirname, 'fichier', nom);
    const python = spawn('python',[fichier]);


    python.stdout.on ('data', (data) => {
        cool = data.toString();
        bool=true;
        console.log(data.toString());
        res.json({ success: bool , pythonMessage: cool });
        //return res.status(200).json({ success : true, donnee: cool });
    });

    python.stderr.on('data', (data) => {
        cool = data.toString();
        bool=false;
        //console.log(`stderr: ${data}`);
        //return res.status(200).json({ success : false, donnee: cool });
    });

    python.on('close', (code) => {
    console.log (`Fin du programme : ${code}`);
    console.log(cool);
    res.json({ success: bool , pythonMessage: cool });
    });



});*/

app.post('/console', async (req,res)=>{
    const { nom } = req.body;
    console.log(nom);
    var cool='';
    var bool=false;
    //nom = nom.toString();
    const fichier = path.join(__dirname, 'fichier', nom);
    const python = spawn('python',[fichier]);


    python.stdout.on ('data', (data) => {
        cool = data.toString();
        bool=true;
        //res.json({ success: bool , pythonMessage: cool });
        //return res.status(200).json({ success : true, donnee: cool });
    });

    python.stderr.on('data', (data) => {
        cool = data.toString();
        bool=false;
        //console.log(`stderr: ${data}`);
        //return res.status(200).json({ success : false, donnee: cool });
    });

    python.on('close', (code) => {
    //console.log (`Fin du programme : ${code}`);
    //console.log(cool);
    res.json({ success: bool , donnee: cool });
    });



});
/*
app.post('/api/python-message', (req, res) => {
    const { nom, valeur } = req.body;
    let pythonMessage = '';

    // Étape 1 : Lancer le script Python
    const fichier = path.join(__dirname, 'fichier', nom);
    const pythonProcess = spawn('python',[fichier], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Étape 2 : Capturer la question initiale de Python
    pythonProcess.stdout.on('data', (data) => {
        pythonMessage += data.toString();
        console.log(pythonMessage);
    });

    // Étape 3 : Transmettre la réponse utilisateur à Python
    pythonProcess.stdin.write(valeur + '\n');
    pythonProcess.stdin.end();

    // Étape 4 : Capturer le résultat final de Python
    let pythonResult = '';
    pythonProcess.stdout.on('data', (data) => {
        pythonResult += data.toString();
        console.log(pythonResult);
    });

    pythonProcess.on('close', () => {
        res.json({
            pythonMessage: pythonMessage.trim(),
            pythonResult: pythonResult.trim(),
        });
    });
});*/

server.listen(PORT, () => {
    console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});

