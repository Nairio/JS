//nairio
const functions=require("firebase-functions");

var token;

exports.google=functions.https.onRequest((request, response)=>{
	var query=(function(u){var q={};if(!u)return q;u.split("&").forEach(function(d){q[d.split("=").shift()]=decodeURIComponent(d.split("=").pop())});return q})(request.url.split("?")[1]);
	var referer=store(request.headers.referer?request.headers.referer.split("://")[1].split("/")[0]:"").domains[0];

	var admin=require("firebase-admin");
	if(!admin.apps.length)admin.initializeApp(functions.config().firebase);

	var google=require("googleapis").google;
	var credentials=require("./data/googledrive.json").web;
	var auth=new google.auth.OAuth2(credentials.client_id, credentials.client_secret, credentials.redirect_uris[0]);
	var drive=google.drive({version: "v3", auth});

	function readStorageToken(callBack){
		if(token)return callBack("local");
		admin.storage().bucket().file("token.json").download().then(data=>{
			token=JSON.parse(data[0].toString());
			callBack("storage");
		}).catch(function(){
			callBack("new");
		});
	}
	function writeStorageToken(callBack){
		var stream=admin.storage().bucket().file("token.json").createWriteStream();
		stream.write(JSON.stringify(token));
		if(callBack){
			stream.on("finish", callBack)
		};
		stream.end();
	}
	function revokeToken(){
		auth.revokeToken(token.access_token);
		token=null;
		writeStorageToken(()=>{
			response.writeHead(302, {'Location': '/google/'});
			response.end();
		});
	}
	function codeToken(code){
		auth.getToken(code, (err, data)=>{
			token=data;
			writeStorageToken(()=>{
				response.writeHead(302, {'Location': '/google/'});
				response.end();
			});
		});
	}
	function requestAccess(){
		response.writeHead(302, {'Location': auth.generateAuthUrl({access_type: 'offline', approval_prompt: 'force', approvalPrompt: 'force', scope: ["https://www.googleapis.com/auth/drive.file","https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/drive"]})});
		response.end();
	}
	function isTokenExpired(){
		return token.expiry_date<new Date().getTime();
	}
	function refreshToken(callBack){
		auth.refreshToken(token.refresh_token).then(function(data){
			data=data.tokens;
			data.refresh_token=token.refresh_token;
			token=data;
			writeStorageToken(callBack);
		});
	}

	function getFile(name, callBack){
		drive.files.list({q: "'root' in parents and name='Каталог2018' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
			drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='"+referer+"' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
				drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='images' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
					drive.files.list({
						q: `'${res.data.files[0].id}' in parents and name='${name.replace(/\+/ig, " ")}'`,
						orderBy: "modifiedTime",
					    includeRemoved: false,
					    spaces: 'drive',
						pageSize: 1,
						fields: 'files(id, webContentLink, shared)'
					}, callBack);
				})
			})
		})
	}
	function exportFile(fileId, mimeType, callBack){
		get("https://www.googleapis.com/drive/v3/files/"+fileId+"/export?mimeType="+mimeType, callBack, {"Authorization": 'Bearer '+token.access_token})
	}
	function share(fileId, callBack){
		drive.permissions.create({fileId: fileId, resource:{role:"reader", type:"anyone"}}, callBack);
	}
	function getFileLink(name, callBack){
		getFile(name, function(err, res){
			var file=err?{}:res.data.files[0];
			if(err){
				callBack(err);
			}else{
				if(file.shared){
					callBack(err, file.webContentLink);
				}else{
					share(file.id, function(err){
						callBack(err, file.webContentLink);
					});
				};
			};
		});
	}
	function login(callBack){
		if(query.code){
			codeToken(query.code)
		}else{
			readStorageToken((type)=>{
				if(!token){
					requestAccess()
				}else{
					if(query.revoke||!token.refresh_token){
						revokeToken()
					}else{
						if(isTokenExpired()){
							refreshToken(()=>{
								auth.setCredentials(token);
								callBack();
							})
						}else{
							auth.setCredentials(token);
							callBack()
						}
					}
				}
			})
		}
	}

	function checkShare(file, callBack){
		if(file.shared){
			callBack();
		}else{
			share(file.id, callBack)
		};
	}
	function addImages(res, images, callBack){
		for(var i in res.data.files){
			var file=res.data.files[i];
			checkShare(file, ()=>{
				images[seoencode(file.name).replace("-jpg","").replace("-jpeg","")]=file.webContentLink;
				if(i==res.data.files.length-1){
					callBack()
				}
			})
		}
	}
	function listImages(fileId, pageToken, page, images, callBack){
		if(!pageToken && page>0){
			return callBack(images)
		};
		drive.files.list({q: "mimeType='image/jpeg'", includeRemoved: false, spaces: 'drive', pageToken: pageToken, fields: 'nextPageToken, files(id, webContentLink, shared, name)'}, (err, res)=>{
			if(err){
				return listImages(fileId, pageToken, page, images, callBack)
			};
			if(res.data.files.length){
				addImages(res, images, ()=>{
					listImages(fileId, res.data.nextPageToken, page+1, images, callBack);
				});
			}else{
				callBack(images)
			}
		});
	}
	function getCatalogFileId(callBack){
		drive.files.list({q: "'root' in parents and name='Каталог2018' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
			drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='"+query.domain+"' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
				drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='Каталог' and mimeType='application/vnd.google-apps.spreadsheet'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
					callBack(res.data.files[0].id)
				})
			})
		})
	}
	function getImagesFileId(callBack){
		drive.files.list({q: "'root' in parents and name='Каталог2018' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
			console.log(err, res);
			drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='"+query.domain+"' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
				drive.files.list({q: "'"+res.data.files[0].id+"' in parents and name='Images' and mimeType='application/vnd.google-apps.folder'", includeRemoved: false, spaces: 'drive', pageSize: 1, fields: 'files(id)'}, (err, res)=>{
					callBack(res.data.files[0].id)
				})
			})
		})
	}
	function createCache(products, callBack){
		const admin=require("firebase-admin");
		if(!admin.apps.length)admin.initializeApp(functions.config().firebase);
		var ref=admin.database().ref().child("sku").child(query.domain.replace(/\./gi, "-"));
		ref.once("value").then(snap=>{
			var sku=snap.val()?snap.val():{};
			sku={urls:{}, tags:{}, items: sku.items?sku.items:{}, last: sku.last?sku.last:0};
			for(var pi in products){
				var seo=seoencode(products[pi].name);
				sku.urls[seo]=pi;
				sku.items[seo]=sku.items[seo]?sku.items[seo]:(sku.last=sku.last*1+1);
				products[pi].sku=sku.items[seo];
				var pTags=(p=>{var t=[];p.forEach(v=>{if(v)t.push(v.trim())});return t})(products[pi].tags.split("#"));
				for(var i in pTags){
					var seo=seoencode(pTags[i]);
					if(!sku.tags[seo])sku.tags[seo]={items:{}, title: pTags[i], count:0};
					if(products[pi].status){
						sku.tags[seo].count++;
					};
					for(var j in pTags){
						if(i!=j){
							if(!sku.tags[seo]["items"][pTags[j]])sku.tags[seo]["items"][pTags[j]]=0;
							if(products[pi].status){
								sku.tags[seo]["items"][pTags[j]]++;
							}
						}
					}
				}
				products[pi]=JSON.stringify(products[pi]);
			};
			ref.set({items: sku.items, last: sku.last}).then(()=>callBack(sku));
		});
	}

	login(()=>{
		if(query.name){
			if(referer){
				getFileLink(query.name, function(err, link){
					if(!err){
						response.writeHead(302, {'Location': link});
						response.end();
					}else{
						if(query.name.split(".").splice(-2,1)>0){
							response.writeHead(302, {'Location': "//"+request.host+"/lib/1px.gif"});
							response.end();
						}else{
							response.writeHead(302, {'Location': "//"+request.host+"/lib/no-image.png"});
							response.end();
						};
					}
				})
			}else{
				response.writeHead(302, {'Location': "//"+request.host+"/lib/no-image.png"});
				response.end();
			}
		}else{
			adminAuth(request, response, admin=>{
				if(query.domain){
					getImagesFileId(fileId=>{
						listImages(fileId, null, 0, {}, function(images){
							getCatalogFileId(fileId=>{
								exportFile(fileId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data=>{
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
		
									createCache(products, (cache)=>{
										cache.tags=JSON.stringify(cache.tags);
										cache.urls=JSON.stringify(cache.urls);
										response.status(200);
										//response.setHeader("Content-Type", "application/json; charset=utf-8");
										//response.setHeader("Content-Disposition", "inline; filename='products.json'");
										var s=`{\n\t"updated":"${new Date()}",\n\t"products":[\n\t\t${products.join(",\n\t\t")}\n\t],\n\t"tags":${cache.tags},\n\t"urls":${cache.urls}\n}`;
										response.end(`<script>tabs.ready(function(){tabs.download(\`${s}\`, "products.json")})</script>`);								
									})
								})
							})
						})
					})
				}else{
					var stores=require("./data/stores.json").stores;
					response.status(200);
					for(var i in stores){
						response.write(`<a target="_blank" href="?domain=${stores[i].domains[0]}">${stores[i].domains[0]}</a><br>`);					
					};
					response.end();
				};
			})
		}
	})
});



