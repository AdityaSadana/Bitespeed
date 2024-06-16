import express, { Express, Request, Response } from "express";
import { postUser } from "./post_user";

const app: Express = express();
const port = process.env.PORT || 4000;

app.use(express.json())

interface User {
  id: number,
  phoneNumber: string,
  email: string,
  linkedinId?: number,
  linkPrecedence?: number,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date
}

app.post('/identify', (req: Request, res: Response) => {
  console.log(req.body)
  postUser(req.body.email, req.body.phoneNumber)
  .then(result => {
    res.send(result)
  })
  .catch(err => {
    console.error(err)
    res.send(err)
  })
})

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});