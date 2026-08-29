agents-cli deploy \
	--project classisstant \
	--service-account classistant-agent@classisstant.iam.gserviceaccount.com \
	--service-name classistant-agent \
	--update-env-vars DEBUG="false" # Remove test user id in prod