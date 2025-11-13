export default async function handler(req, res) {
  try {
    const { zipCode, date, preferredTime, timeRange, groupSize } = req.query;
    const BASE_URL = "https://getcourseavailability.azurewebsites.net/api";
    const API_CODE = process.env.API_CODE;

    // 1) Get courses from your Azure Function
    const coursesResp = await fetch(`${BASE_URL}/get_courses?zip_code=${zipCode}&code=${API_CODE}`);
    if (!coursesResp.ok) return res.status(coursesResp.status).json({ error: "Failed to fetch courses" });
    const courses = await coursesResp.json();

    // 2) For each course, fetch Chronogolf data server-side (no CORS issues server-to-server)
    const combinedBody = [];
    for (const course of courses) {
      let page = 1;
      const combinedCourseTeeTime = [];
      while (true) {
        const chronoUrl = new URL("https://www.chronogolf.com/marketplace/v2/teetimes");
        chronoUrl.searchParams.set("start_date", date);
        chronoUrl.searchParams.set("course_ids", course.uuid);
        chronoUrl.searchParams.set("page", String(page));
        const r = await fetch(chronoUrl.toString());
        if (!r.ok) break;
        const data = await r.json();
        const teeTimes = data.teetimes || [];
        if (teeTimes.length === 0) break;
        combinedCourseTeeTime.push(...teeTimes);
        page++;
      }
      if (combinedCourseTeeTime.length > 0) {
        combinedBody.push({
          tee_times: combinedCourseTeeTime,
          preferred_time: preferredTime,
          time_range: Number(timeRange),
          group_size: Number(groupSize),
          course_name: course.name,
          course_slug: course.slug,
          date
        });
      }
    }

    if (!combinedBody.length) return res.json([]);

    // 3) Filter via your Azure Function
    const filteredResp = await fetch(`${BASE_URL}/filter_tee_times?code=${API_CODE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(combinedBody)
    });
    if (!filteredResp.ok) return res.status(filteredResp.status).json({ error: "Filter failed" });
    const filtered = await filteredResp.json();
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
}