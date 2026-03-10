#include <stdio.h>
#include <string.h>
#include <stdbool.h>
bool checktn(char s[20]){
 int a=s[0]-'0';int b=s[strlen(s)-1]-'0';
if(a*2!=b&&a!=2*b){
return 0;
}
 for(int i=1;i<strlen(s)/2;i++){
    if(s[i]!=s[strlen(s)-i-1]){
        return 0;
    }
    
}
return 1;

}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        char s[20];scanf("%s",s); 
        if(checktn(s))printf("YES\n");
        else printf("NO\n");
    }   
}