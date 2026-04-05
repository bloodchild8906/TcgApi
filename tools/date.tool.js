const DateTool = {};

// -------- Date & timestamp -------
DateTool.isDate = function(date)
{
    if (Object.prototype.toString.call(date) === "[object Date]") {
        return !isNaN(date.getTime());
    }
    return false;  
};

DateTool.tagToDate = function(tag)
{
    if(typeof tag !== "string")
        return null;

    const parts = tag.split('-');
    if (parts.length !== 3)
        return null;

    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return  DateTool.isDate(d) ? d : null;  
};

DateTool.dateToTag = function(d)
{
    if(!DateTool.isDate(d))
        return "";

    const year = '' + d.getFullYear();
    const month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
};

DateTool.getStartOfDay = function(date){
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

DateTool.addDays = function(date, days) {
    return new Date(date.getTime() + days*24*60*60*1000);
}

DateTool.addHours = function(date, hours) {
    return new Date(date.getTime() + hours*60*60*1000);
}

DateTool.addMinutes = function(date, minutes) {
    return new Date(date.getTime() + minutes*60000);
}

DateTool.minDate = function()
{
    return new Date(-8640000000000000);
}

DateTool.maxDate = function()
{
    return new Date(8640000000000000);
}

DateTool.countDays = function(from, to) {
    const ms_per_day = 1000 * 60 * 60 * 24;
    return Math.round((to - from) / ms_per_day);
}

module.exports = DateTool;