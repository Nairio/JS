var xlsx=require("xlsx");
var workbook=xlsx.read(data, {type: "binary"});
var products=[];
for(var sheet in workbook.Sheets){
	var data=xlsx.utils.sheet_to_json(workbook.Sheets[sheet]);
	for(var j in data){
		var line=(function(d){var r=[];for(var i in d)r.push(d[i]?d[i].toString():"");return r})(data[j]);
		if(line[0] && line[1] && line[3] && line[4]){
			products.push({
				name:	line[0].replace(/\s+/gi, " ").trim(),
				price:	line[1].replace(/\s+/gi, ""),
				discount:	line[2].replace(/\s+/gi, ""),
				status:	line[4]?1:0,
				image:	images[seoencode(line[0])],
				tags:		(" #"+sheet.toLowerCase()+" "+(line[2]?"#акция ":"")+line[3].toLowerCase().replace(/[^а-яёa-z0-9#]/g, " ").replace(/\s+/gi, " ").trim()).split(" #").filter((v, i, a)=>a.indexOf(v)==i).join(" #").trim(),
			});
		}
	}
};