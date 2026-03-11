#include <stdio.h>
#include <string.h>
void demt(char s[1000]){
    int count =0;
    for(int i=0;i<s[i]!='\0';i++){
        if(s[i]>='a'&&s[i]<='z'){
            count++;
        }
    }
    printf("%d",count);
}
int main(){
    char s[1000];
   gets(s);
    demt(s);
}