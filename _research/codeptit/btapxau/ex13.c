#include <stdio.h>
#include <string.h>
void doi(char s[1000]){
    for(int i=0;s[i]!='\0';i++){
        if(s[i]>='a'&&s[i]<='z'){
            s[i]-=32;
        }
        else if(s[i]>='A'&&s[i]<='Z'){
            s[i]+=32;
        }
    }
    printf("%s",s);
}
int main(){
    char s[1000];gets(s);
    doi(s);
}