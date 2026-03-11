#include <stdio.h>
#include <string.h>
void dem(char s[1000]){
    int count1=0,count2=0,count3=0;
    for(int i=0;s[i]!='\0';i++){
        if(s[i]>='0'&&s[i]<='9'){
            count1++;
        }
        else if(s[i]>='A'&&s[i]<='z'){
            count2++;
        }
        else count3++;
    }
    printf("%d %d %d",count1,count2,count3);

}
int main(){
    char s[1000];scanf("%s",s);
    dem(s);
}