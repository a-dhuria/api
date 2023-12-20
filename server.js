const express = require('express');
const cors=require('cors');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const { parse, isBefore, isAfter, isEqual, addDays, format} = require('date-fns');

const app = express();
const port = 4000;

// MySQL database configuration
const dbConfig = {
  host:"calendar.mysql.database.azure.com", user:"GCal", password:"password@123", database:"calendar", port:3306,
  ssl:{ca:fs.readFileSync("C:\\Users\\adhuria003\\Downloads\\DigiCertGlobalRootCA.crt.pem")}
};

// Middleware to parse JSON data in the request body
app.use(bodyParser.json());
app.use(express.json());

app.use(cors());

async function createConnection() {
  return await mysql.createConnection(dbConfig);
}

app.get('/search-course', async (req, res) => {
  const searchDate = req.query.date;
  if (!searchDate) {
    return res.status(400).json({ error: 'Date parameter is missing' });
  }

  const formattedSearchDate = parse(searchDate, 'dd/MM/yyyy', new Date());
  const connection = await createConnection();

  try {
    const [results] = await connection.query('SELECT * FROM Calender');
    const coursesOnDate = results.filter((course) => {
      const courseStartDate = parse(course.startProgramDates, 'dd/MM/yyyy', new Date());
      const courseEndDate = parse(course.endProgramDates, 'dd/MM/yyyy', new Date());

      // Check if the search date is within the range of start and end dates
      // Also check if the search date is before the end date or equal to the end date
      return (
        (isAfter(formattedSearchDate, courseStartDate) || isEqual(formattedSearchDate, courseStartDate)) &&
        (isBefore(formattedSearchDate, courseEndDate) || isEqual(formattedSearchDate, courseEndDate))
      );
    });

    if (coursesOnDate.length === 0) {
      // Return NA for all columns if no courses are found
      const naResponse = {
        source: 'NA',
        startProgramDates: 'NA',
        endProgramDates: 'NA',
        startTime: 'NA',
        endTime: 'NA',
        courseName: 'NA',
        targetAudience: 'NA',
        format: 'NA'
      };

      return res.status(404).json(naResponse);
    }

    res.json(coursesOnDate);
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

// API endpoint to add enrollment data
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.post('/enroll', async (req, res) => {
  const {
    email,
    source,
    startProgramDates,
    endProgramDates,
    startTime,
    endTime,
    courseName,
    targetAudience,
    format,
  } = req.body;
 
  // Check if required fields are present in the request body
  if (!email || !source || !startProgramDates || !endProgramDates || !startTime || !endTime || !courseName || !targetAudience || !format) {
    return res.status(400).json({ error: 'Missing required fields in the request body' });
  }
 
  const connection = await mysql.createConnection(dbConfig);
 
  try {
    const sql = `
      INSERT INTO Enrollment
      (email, source, startProgramDates, endProgramDates, startTime, endTime, courseName, targetAudience, format)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
 
    const data = [email, source, startProgramDates, endProgramDates, startTime, endTime, courseName, targetAudience, format];
 
    const [results] = await connection.query(sql, data);
 
    res.json({ message: 'Enrollment data added successfully', insertId: results.insertId });
  } catch (error) {
    console.error('Error inserting enrollment data into the database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});


//Upcoming events
app.get('/all-courses', async (req, res) => {
  const connection = await createConnection();
 
  try {
    // Get the current date
    const currentDate = new Date();
 
    const [results] = await connection.query(
      'SELECT * FROM Calender WHERE STR_TO_DATE(startProgramDates, "%d/%m/%Y") >= ? ORDER BY STR_TO_DATE(startProgramDates, "%d/%m/%Y")',
      [currentDate]
    );
   
   
 
    if (results.length === 0) {
      return res.status(404).json({ error: 'No courses found starting from the current date' });
    }
 
    res.json(results);
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});
app.get('/course-details/:courseName', async (req, res) => {
  const courseName = req.params.courseName;

  if (!courseName) {
    return res.status(400).json({ error: 'Course name parameter is missing' });
  }

  const connection = await mysql.createConnection(dbConfig);

  try {
    const [results] = await connection.query('SELECT * FROM Calender WHERE courseName = ?', [courseName]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(results);
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});
app.get('/courses-count-by-date', async (req, res) => {
  const connection = await createConnection();

  try {
    const [results] = await connection.query(
      'SELECT startProgramDates, endProgramDates, COUNT(*) as courseCount FROM Calender GROUP BY startProgramDates, endProgramDates'
    );

    if (results.length === 0) {
      return res.status(404).json({ error: 'No courses found' });
    }

    const coursesCountByDate = [];

    results.forEach(({ startProgramDates, endProgramDates, courseCount }) => {
      const startDate = parse(startProgramDates, 'dd/MM/yyyy', new Date());
      const endDate = parse(endProgramDates, 'dd/MM/yyyy', new Date());

      // Count the course for each day between start and end dates
      for (
        let currentDay = startDate;
        isBefore(currentDay, endDate) || isEqual(currentDay, endDate);
        currentDay = addDays(currentDay, 1)
      ) {
        const formattedDate = format(currentDay, 'dd/MM/yyyy');
        const existingEntry = coursesCountByDate.find(
          (entry) => entry.date === formattedDate
        );

        if (existingEntry) {
          existingEntry.courseCount += courseCount;
        } else {
          coursesCountByDate.push({
            date: formattedDate,
            courseCount,
          });
        }
      }
    });

    res.json(coursesCountByDate);
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

// app.get('/courses-count-by-date', async (req, res) => {
//   const connection = await createConnection();
 
//   try {
//     const [results] = await connection.query('SELECT startProgramDates, endProgramDates, COUNT(*) as courseCount FROM Calender GROUP BY startProgramDates, endProgramDates');
 
//     if (results.length === 0) {
//       return res.status(404).json({ error: 'No courses found' });
//     }
 
//     const coursesCountByDate = [];
 
//     results.forEach(({ startProgramDates, endProgramDates, courseCount }) => {
//       const startDate = parse(startProgramDates, 'dd/MM/yyyy', new Date());
//       const endDate = parse(endProgramDates, 'dd/MM/yyyy', new Date());
 
//       // Count the course for each day between start and end dates
//       for (let currentDay = startDate; isBefore(currentDay, endDate) || isEqual(currentDay, endDate); currentDay = addDays(currentDay, 1)) {
//         const formattedDate = format(currentDay, 'dd/MM/yyyy');
//         const existingEntry = coursesCountByDate.find((entry) => entry.date === formattedDate);
 
//         if (existingEntry) {
//           existingEntry.courseCount += courseCount;
//         } else {
//           coursesCountByDate.push({
//             date: formattedDate,
//             courseCount,
//           });
//         }
//       }
//     });
 
//     res.json(coursesCountByDate);
//   } catch (error) {
//     console.error('Error querying database:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   } finally {
//     await connection.end();
//   }
// });

app.get('/all-courses-with-status', async (req, res) => {
  const connection = await createConnection();
 
  try {
    const [results] = await connection.query('SELECT * FROM Calender ORDER BY STR_TO_DATE(startProgramDates, "%d/%m/%Y")');
 
    if (results.length === 0) {
      return res.status(404).json({ error: 'No courses found in the database' });
    }
 
    const currentDate = new Date();
   
    const coursesWithStatus = results.map((course) => {
      const courseStartDate = course.startProgramDates==='TBD' ? null: parse(course.startProgramDates, 'dd/MM/yyyy', new Date());
      const courseEndDate = parse(course.endProgramDates, 'dd/MM/yyyy', new Date());
 
      let status = '';
      if(courseStartDate===null){
        status='TBD';
      }
      else if (isBefore(currentDate, courseStartDate)) {
        status = 'Upcoming';
      } else if (isAfter(currentDate, courseEndDate)) {
        status = 'Completed';
      } else {
        status = 'Ongoing';
      }
 
      return { ...course, status };
    });
 
    res.json(coursesWithStatus);
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});