import { Client } from "pg";

interface UserContact {
  primaryContactId: number,
  emails: string[],
  phoneNumbers: string[],
  secondaryContactIds: number[]
}

interface PostUserResponse {
  contact: UserContact
}

const getAllUserDetailsFromPrimaryId = async (client: Client, id: number): Promise<PostUserResponse> => {
  console.log("primaryId => ", id)
  
  const primaryRes = ((await client.query(`
    SELECT email, phonenumber FROM users 
    WHERE id = $1 
    AND linkprecedence = 'primary';
    `, [id])).rows[0])

  console.log("primaryRes => ", primaryRes)

  const secondaryRes = (await client.query(`
    SELECT id, email, phonenumber
    FROM users
    WHERE linkedid = $1 
    AND linkprecedence = 'secondary'
    ;
    `, [id])).rows

  let emails: string[] = []
  let phoneNumbers: string[] = []
  if (primaryRes.email) {
    emails.push(primaryRes.email)
  }

  if (primaryRes.phonenumber) {
    phoneNumbers.push(primaryRes.phonenumber)
  }

  secondaryRes.map(res => {
    if (res.email && !emails.includes(res.email)) {
      emails.push(res.email)
    }
    if (res.phonenumber && !phoneNumbers.includes(res.phonenumber)) {
      phoneNumbers.push(res.phonenumber)
    }
  })

  return {
    contact: {
      primaryContactId: id,
      emails: emails,
      phoneNumbers: phoneNumbers,
      secondaryContactIds: secondaryRes.map(res => {return (res.id)})
    }
  }
  
}

export const postUser = async (email?: string, phoneNumber?: string): Promise<PostUserResponse> => {

  if (!email && !phoneNumber) {
    throw new Error("Either email or phonenumber should be given.")
  }

  console.log("email =>", email, "phonenumber =>", phoneNumber)

  const client = new Client({
    user: 'aditya',
    host: 'dpg-cpni26tds78s73b18320-a',
    database: 'bitespeed_j4ik',
    password: 'B5i4SSznJB6ujbwRxxEZu2FKc7yu1n7c',
    port: 5432,
  });

  try {

    await client.connect()
    console.log("Connected to PostgreSQL database successfully");

    /*
    Approach to follow:
    (1) Get primaryId of user with email.
    (2) Get primaryId of user with phonenumber.
    (3) If both are null => Create a new user and return details
    (4) Else If any one of them is null => Get all users with linkedid as the not null id and create new user. return details
    (3) Else If both match => Get all the id, emails, phonenumbers of all users with linkedid = matched id
    (4) Else => The least of two id becomes linkedid of all the users with linkedid = higher id. Fetch id, email, phonenumber of all users with linkedid or id = least id
    */
    let emailMatchedIds: {id?: number, linkedid?: number}[] = []
    if (email) {
      emailMatchedIds = (await client.query(`
        SELECT id, linkedid FROM users
        WHERE email = $1
        ORDER BY (CASE WHEN id IS NULL THEN 1 ELSE 0 END)
        LIMIT 1
        ;
      `, [email])).rows
    }

    let phonenumberMatchedIds: {id?: number, linkedid?: number}[] = []
    if (phoneNumber) {
      phonenumberMatchedIds = (await client.query(`
        SELECT id, linkedid FROM users
        WHERE phonenumber = $1
        ORDER BY (CASE WHEN id IS NULL THEN 1 ELSE 0 END)
        LIMIT 1
        ;
      `, [phoneNumber])).rows
    }

    console.log("emailMatchedIds =>", emailMatchedIds, "phonenumberMatchedIds =>", phonenumberMatchedIds)

    if (emailMatchedIds.length === 0 && phonenumberMatchedIds.length === 0){
      const newId = (await client.query(`
        INSERT INTO users(email, phonenumber)
        VALUES($1, $2)
        RETURNING id
        ;
      `, [email, phoneNumber])).rows[0].id

      return {
        contact: {
          primaryContactId: newId,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: []
        }
      }
    }

    if (emailMatchedIds.length === 0 && email) {
      if (phonenumberMatchedIds.length > 0) {
        const tempId = (await client.query(`
          INSERT INTO users(email, phonenumber)
          VALUES($1, $2)
          RETURNING id
          ;
        `, [email, phoneNumber])).rows[0].id

        emailMatchedIds = [{id: tempId}]
      }
    }
    if (phonenumberMatchedIds.length === 0 && phoneNumber) {
      if (emailMatchedIds.length > 0) {
        const tempId = (await client.query(`
          INSERT INTO users(email, phonenumber)
          VALUES($1, $2)
          RETURNING id
          ;
        `, [email, phoneNumber])).rows[0].id

        phonenumberMatchedIds = [{id: tempId}]
      }
    }

    console.log("emailMatchedIds =>", emailMatchedIds, "phonenumberMatchedIds =>", phonenumberMatchedIds)
    let primaryId: number
    
    if (emailMatchedIds.length > 0 && phonenumberMatchedIds.length === 0) {
      primaryId = emailMatchedIds[0].linkedid || emailMatchedIds[0].id!
    }
    else if (phonenumberMatchedIds.length > 0 && emailMatchedIds.length === 0) {
      primaryId = phonenumberMatchedIds[0].linkedid || phonenumberMatchedIds[0].id!
    }
    else {
      const emailPrimaryId = emailMatchedIds[0].linkedid || emailMatchedIds[0].id!
      const phoneNumberPrimaryId = phonenumberMatchedIds[0].linkedid || phonenumberMatchedIds[0].id!

      if (emailPrimaryId < phoneNumberPrimaryId) {
        (await client.query(`
          UPDATE users SET 
          linkedid = $1,
          linkprecedence = 'secondary',
          updatedat = now()
          WHERE linkedid = $2
          OR id = $2
          `, [emailPrimaryId, phoneNumberPrimaryId]))

        primaryId = emailPrimaryId
      }
      else if (phoneNumberPrimaryId < emailPrimaryId) {
        (await client.query(`
          UPDATE users SET 
          linkedid = $1,
          linkprecedence = 'secondary',
          updatedat = now()
          WHERE linkedid = $2
          OR id = $2
          `, [phoneNumberPrimaryId, emailPrimaryId]))

        primaryId = phoneNumberPrimaryId
      }
      else {
        primaryId = phoneNumberPrimaryId
      }
    }

    return getAllUserDetailsFromPrimaryId(client, primaryId)

  } catch (err) {

    console.error('Error connecting to the database', err);
    await client.end();
    throw err

  }
}
