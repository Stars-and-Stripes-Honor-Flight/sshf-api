const express = require('express');
const app = express();

app.listen(3010, () => {
    console.log("Server running on port 3010");
});

app.get("/msg", (req, res, next) => {
    res.json({"message": "Hello, World!"});
});

app.use(express.json()); // for parsing application/json

app.post("/msg", (req, res, next) => {
    const newMessage = new Message(req.body.message);
    res.json({"receivedMessage": newMessage.getContent()});
});


class Message {
    constructor(content) {
        this.content = content;
    }

    getContent() {
        return this.content;
    }
}