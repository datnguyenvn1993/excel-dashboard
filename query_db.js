const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/gsm_dashboard'
});
client.connect().then(() => {
    return client.query("SELECT create_date, create_hour, count(*) as count FROM orders WHERE create_date >= current_date - interval '14 days' GROUP BY 1,2 ORDER BY 1 DESC, 2 ASC;");
}).then(res => {
    console.log(res.rows);
    client.end();
}).catch(err => {
    console.error(err);
    client.end();
});
