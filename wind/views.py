# Create your views here.
from django.http import HttpResponse
from django.template import RequestContext, loader
import urllib
import urllib2
import requests
from django.shortcuts import redirect
from django.core.urlresolvers import reverse
from student.views import login_user

from django.contrib.auth.models import User




def login(request):
	if request.user.is_authenticated():
		return redirect(reverse('dashboard'))
	if 'ticketid' not in request.GET:
		return redirect("http://400pixels.net/fakewind/fake_wind_page.php?destination=http://192.168.20.40:8000/login/")
		'''template = loader.get_template('wind/index.html')
		context = RequestContext(request, {})
		return HttpResponse(template.render(context))'''
	else:
		'''
		post_data = [('ticketid',request.GET.get('ticketid', '')),]     # a sequence of two element tuples
		result = urllib2.urlopen('http://400pixels.net/fakewind/fake_wind_validation.php?'+urllib.urlencode(post_data))
		content = result.read()
		return HttpResponse('Validation Successful!<br />Contents of ticket validation response:<br />'+content if 'yes' in content else 'Validation Failed!<br />Contents of ticket validation response:<br />'+content);
		#return HttpResponse("There's a GET message! ticketid is " +request.GET.get('ticketid', ""))
		'''
		post_data = {'ticketid':request.GET.get('ticketid', '')}
		result = requests.get('http://400pixels.net/fakewind/fake_wind_validation.php', params=post_data)
		content_array = result.text.split()
		#return HttpResponse(content_array[0]=='yes')
		
		#return redirect(reverse('dashboard'))
		if (content_array[0] == 'yes'):
			try:
				user = User.objects.get(email=content_array[1]+'@columbia.edu')
			except User.DoesNotExist:
				return HttpResponse("User does not exist!"); 

			request.POST = request.POST.copy()
			
			#newrequest = request.copy()
			#request.POST = dict()
			
			request.POST['email'] = content_array[1]+'@columbia.edu'
			
			request.POST['password'] = 'secret'


			#return HttpResponse(content_array[1]+'@columbia.edu')
			login_user(request)
			return redirect(reverse('dashboard'))

			#return HttpResponse('Validation Successful!<br />Contents of ticket validation response:<br />'+' '.join(content_array))
		else:
			return HttpResponse('Validation Failed!<br />Contents of ticket validation response:<br />'+content_array[0])
			#return HttpResponse("There's a GET message! ticketid is " +request.GET.get('ticketid', ""))
		
    
def fakewind(request):
	return HttpResponse("Hello, world. You're at fake WIND.")