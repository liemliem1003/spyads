const puppeteer = require("puppeteer");
const XLSX = require('xlsx');
const fs = require("fs");
const axios = require("axios");

async function test(text, profile_id) {
    try {
        // Mở profile trên GPM-Login

        const { remote_debugging_address } = await OpenProfile(profile_id);
        if (!remote_debugging_address) throw new Error("⚠️ Không tìm thấy remote_debugging_address!");
        console.log(remote_debugging_address);

        // Kết nối Puppeteer với trình duyệt GPM-Login
        const browser = await puppeteer.connect({
            browserURL: `http://${remote_debugging_address}`,
            defaultViewport: null,
        });

        const page = await browser.newPage();
        await page.goto('https://www.google.com/search?q=' + text, { waitUntil: 'load', timeout: 0 });

        const btn = await page.$$('[aria-label="Tại sao lại là quảng cáo này?"]');
        for (let i = 0; i < btn.length; i++) {
            await btn[i].click()
            console.log(i);
            await page.waitForSelector('g-dialog-content', { visible: true, timeout: 5000 });
            const dialog = await page.$('g-dialog-content');
            
            const region = await dialog.$$('[role="region"]');
            const nameText = await page.evaluate(regionElement => {
                const text = regionElement.innerText.trim();  // Lấy nội dung văn bản
                return text;
            }, region[2]); // Truyền region[2] vào page.evaluate
            
            // Tách các dòng và lấy dòng cuối
            const lines = nameText.split('\n').map(line => line.trim());
            const name = lines.length >= 4 ? lines[3] : 'Không tìm thấy tên';
            const country = lines.length >= 6 ? lines[5] : 'Không tìm thấy tên';
            var item = {
                name: name,
                country: country,
                link: ""
            }
            console.log(item);
            
        }

    } catch (error) {
        console.error("Lỗi khi lấy bài viết:", error);
        return null;
    } finally {

        // await CloseProfile(profile_id)
    }
}
var text = "làm website"
test(text, "1483a808-d496-4be7-ab90-f9fbd740d00e")

async function OpenProfile(profile_id) {
    try {
        const response = await axios.get(`http://127.0.0.1:19995/api/v3/profiles/start/${profile_id}`);
        const { remote_debugging_address } = response.data.data;

        if (!remote_debugging_address) {
            throw new Error("⚠️ API không trả về remote_debugging_address!");
        }

        // console.log("✅ Profile mở thành công:", remote_debugging_address);
        await waitForBrowser(remote_debugging_address);
        return { remote_debugging_address };
    } catch (error) {
        console.error("Lỗi khi mở profile:", error.message);
    }
}
async function CloseProfile(profile_id) {
    try {
        const response = await axios.get(`http://127.0.0.1:19995/api/v3/profiles/close/${profile_id}`);
        console.log("✅ Profile đóng thành công:");
    } catch (error) {
        console.error("Lỗi khi đóng profile:", error.message);
    }
}
async function waitForBrowser(remote_debugging_address, maxRetries = 10, delayMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(`http://${remote_debugging_address}/json/version`);
            if (response.data.webSocketDebuggerUrl) {
                console.log("✅ Trình duyệt đã sẵn sàng!");
                return response.data.webSocketDebuggerUrl;
            }
        } catch (error) {
            console.log(`⏳ Chờ trình duyệt mở... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw new Error("Trình duyệt không sẵn sàng sau thời gian chờ.");
}

