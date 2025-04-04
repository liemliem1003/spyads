const puppeteer = require("puppeteer");
const axios = require("axios");
const XLSX = require('xlsx');
const fs = require("fs");

async function GetInfo(keyword, profile_id) {
    var items = []
    try {
        // Mở profile trên GPM-Login
        const { remote_debugging_address } = await OpenProfile(profile_id);
        if (!remote_debugging_address) throw new Error("⚠️ Không tìm thấy remote_debugging_address!");
        console.log(`🔗 Kết nối đến: http://${remote_debugging_address}`);

        // Kết nối Puppeteer với trình duyệt GPM-Login
        const browser = await puppeteer.connect({
            browserURL: `http://${remote_debugging_address}`,
            defaultViewport: null,
        });

        const page = await browser.newPage();
        await page.goto('https://www.google.com/search?q=' + keyword, { waitUntil: 'load', timeout: 0 });

        const btns = await page.$$('[aria-label="Tại sao lại là quảng cáo này?"]');
        console.log(`🔍 Tìm thấy ${btns.length} quảng cáo được tài trợ.`);

        const taw = await page.$('#taw');
        var links = []
        if (taw) { 
            links = await page.evaluate(element => {
                return Array.from(element.querySelectorAll('a'))
                    .map(a => {
                        const link = a.getAttribute('data-rw') || a.href;  // Lấy data-rw hoặc href nếu không có data-rw
                        const text = a.innerText.trim();  // Lấy văn bản trong thẻ a
                        return { link, text };  // Trả về một object chứa link và text
                    })
                    .filter(linkData => linkData.link);  // Lọc các đối tượng có link không rỗng
            }, taw);
            console.log(links);
        } else {
            console.log('Không tìm thấy #taw');
        }

        for (let i = 0; i < btns.length && i < 2; i++) {
            await btns[i].click();
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await btns[i].click();
            }

            await page.waitForSelector('g-dialog-content', { visible: true, timeout: 5000 });
            const dialog = await page.$('g-dialog-content');

            if (!dialog) {
                console.log(`⚠️ Không tìm thấy 'g-dialog-content' sau khi click.`);
                continue;
            }

            const regions = await dialog.$$('[role="region"]');

            if (regions.length < 3) {
                console.log(`⚠️ Không đủ phần tử 'region' để trích xuất thông tin.`);
                continue;
            }

            // Lấy text từ region[2]
            const nameText = await page.evaluate(el => el.innerText.trim(), regions[2]);

            // Tách dòng và lấy thông tin cần thiết
            const lines = nameText.split('\n').map(line => line.trim());
            const name = lines.length >= 4 ? lines[3] : 'Không tìm thấy tên';
            const country = lines.length >= 6 ? lines[5] : 'Không tìm thấy quốc gia';

            const item = { keyword, infor: links[i].text,Asd_Name: name, country, link_goc: links[i].link, link_aff: '' };
            // const item = { keyword, name, country, link: links[i] };
            items.push(item)
            // await new Promise(resolve => setTimeout(resolve, 50000));
        }
        // await browser.disconnect(); // Ngắt kết nối với trình duyệt

    } catch (error) {
        console.error("❌ Lỗi khi lấy bài viết:", error);
    }
    return items

}

// Mở profile trên GPM-Login
async function OpenProfile(profile_id) {
    try {
        const response = await axios.get(`http://127.0.0.1:19995/api/v3/profiles/start/${profile_id}`);
        const { remote_debugging_address } = response.data.data;

        if (!remote_debugging_address) {
            throw new Error("⚠️ API không trả về remote_debugging_address!");
        }

        await waitForBrowser(remote_debugging_address);
        return { remote_debugging_address };
    } catch (error) {
        console.error("❌ Lỗi khi mở profile:", error.message);
    }
}

// Chờ trình duyệt sẵn sàng
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

// Đóng profile khi xong
async function CloseProfile(profile_id) {
    try {
        await axios.get(`http://127.0.0.1:19995/api/v3/profiles/close/${profile_id}`);
        console.log("✅ Profile đã đóng.");
    } catch (error) {
        console.error("❌ Lỗi khi đóng profile:", error.message);
    }
}

function ReadExcelFile(path) {
    const workbook = XLSX.readFile(path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    return data
}
function ExportToExcel(data) {
    try {
        const fileName = getFormattedDate();
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        XLSX.writeFile(workbook, fileName);

        console.log(`✅ File ${fileName} đã được tạo thành công!`);
    } catch (error) {
        console.error("❌ Lỗi xuất file Excel:", error.message);
    }
}

function getFormattedDate() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0"); // Tháng bắt đầu từ 0
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `data/data_${dd}_${mm}_${yyyy}_${hh}_${min}.xlsx`;
}

async function ToolAuTo() {
    var data = ReadExcelFile("input.xlsx")
    var profile_id = "1483a808-d496-4be7-ab90-f9fbd740d00e"
    // var profile_id = "8957879a-26e5-42fb-a95d-80fc739f1e7f"

    var dataToExport = []
    for (let i = 0; i < data.length; i++) {
        var result = await GetInfo(data[i].keyword, profile_id)

        mergedData = [...dataToExport, result].flat();
        dataToExport = mergedData
    }

    for (let i = 0; i < mergedData.length; i++) {
        if (mergedData[i].link_goc != undefined || mergedData[i].link_goc != null || mergedData[i].link_goc != '') {
            mergedData[i].link_aff = await CheckLink(mergedData[i].link_goc, profile_id)
        }

    }

    mergedData.length > 0 ? ExportToExcel(mergedData) : true

    await CloseProfile(profile_id)
}
ToolAuTo()

async function CheckLink(link, profile_id) {
    var linkReturn = link
    try {
        // Mở profile trên GPM-Login
        const { remote_debugging_address } = await OpenProfile(profile_id);
        if (!remote_debugging_address) throw new Error("⚠️ Không tìm thấy remote_debugging_address!");
        console.log(`🔗 Kết nối đến: http://${remote_debugging_address}`);

        // Kết nối Puppeteer với trình duyệt GPM-Login
        const browser = await puppeteer.connect({
            browserURL: `http://${remote_debugging_address}`,
            defaultViewport: null,
        });

        const page = await browser.newPage();
        await page.goto(link, { waitUntil: 'load', timeout: 0 });
        const currentURL = await page.url();
        linkReturn = currentURL
    } catch (err) {
        console.log(err);
    }finally{
        
    }
    return linkReturn
}
